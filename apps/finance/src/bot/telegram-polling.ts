// pleiades 009 D-1 (pleiades#349 · fit #347 과 같은 모양): 텔레그램 롱폴링을 기다리지 않는 곁가지로 돌린다.
// - 토큰이 없거나 `TELEGRAM_POLLING=off`(앱 `.env` · 정확히 off 일 때만)면 폴링하지 않는다 — 크론·gateway 는 이미 떠 있다(1-2 · 1-4)
// - 실패해도 프로세스를 끝내지 않는다(1-9 · 009 R5 — 재시작마다 Discord IDENTIFY 가 늘던 경로). 401 은 멈추고 1회 알린다 · 그 밖은 간격을 두고 다시
// - 직전에 폴링이 꺼져 있었으면(상태 파일) 켤 때 밀린 업데이트를 버린다(1-5 · L30) — 배포 재시작 중 온 명령은 그대로 처리한다

import fs from 'node:fs'
import path from 'node:path'
import type { Bot } from 'grammy'
import { sanitizeError } from './utils/error'

export type PollingState = 'on' | 'off'

export interface PollingStateStore {
  /** 읽을 수 없으면 undefined — 호출부는 '꺼져 있었다' 로 본다(버리는 쪽). */
  read(): PollingState | undefined
  write(state: PollingState): void
}

/** 상태 파일 — `logs/`(모든 태그에서 무시되는 체크아웃 안 디렉터리 · 재배포·R-8 을 넘어 남는다 · 009 D-1 D3). */
export function filePollingStateStore(file: string): PollingStateStore {
  return {
    read() {
      try {
        const v = (JSON.parse(fs.readFileSync(file, 'utf8')) as { polling?: unknown }).polling
        return v === 'on' || v === 'off' ? v : undefined
      } catch {
        return undefined
      }
    },
    write(state) {
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
        const tmp = `${file}.${process.pid}.tmp`
        fs.writeFileSync(tmp, JSON.stringify({ polling: state, at: new Date().toISOString() }), { mode: 0o600 })
        fs.renameSync(tmp, file)
      } catch (err) {
        console.warn(`[bot] 텔레그램 폴링 상태 기록 실패: ${sanitizeError(err)}`)
        // off 를 못 남기면 옛 on 이 남아 다음 기동이 밀린 명령을 실행한다 — 파일을 지워 '읽기 실패 = 버림' 쪽으로 보낸다
        // (PR #348 Codex P2). on 기록 실패는 다음 기동이 버리는 쪽이라 그대로 둔다
        if (state === 'off') {
          try {
            fs.rmSync(file, { force: true })
          } catch (rmErr) {
            console.error(`[bot] 텔레그램 폴링 상태 파일 삭제도 실패 — 다음 기동 전에 손으로 지운다: ${sanitizeError(rmErr)}`)
          }
        }
      }
    },
  }
}

/** 정확히 `off` 일 때만 끈다 — 그 외·미설정은 지금처럼 켠다(1-1). 앱 `.env` 에만 둔다(루트 `.env` 는 읽지 않는다). */
export function pollingDisabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return (env.TELEGRAM_POLLING ?? '').trim().toLowerCase() === 'off'
}

/** 401(토큰 무효)은 다시 해도 같다 — 멈춘다. 그 밖(409 · 네트워크 · 5xx)은 다시 한다. */
export function isUnauthorized(err: unknown): boolean {
  const code = (err as { error_code?: unknown } | null)?.error_code
  return code === 401
}

/** 다시 시도 간격 — 마지막 값을 반복한다. */
export const TELEGRAM_RETRY_DELAYS_MS: readonly number[] = [5_000, 30_000, 120_000, 300_000]
/** 이만큼 폴링이 이어진 뒤의 실패만 간격을 처음부터 센다 — grammY 는 폴링 전에 onStart 를 부른다(PR #348 Codex P2). */
export const TELEGRAM_STABLE_RUN_MS = 60_000

export interface TelegramPollingOptions {
  /** 토큰이 없으면 undefined. 다시 시도할 때마다 새 인스턴스를 받는다(grammY 는 start 뒤 미들웨어 등록을 막는다). */
  createBot: (() => Bot) | undefined
  state: PollingStateStore
  disabled: boolean
  /** 401 등으로 텔레그램을 멈출 때 1회 — 봇 토큰과 무관한 경로로 보낸다(호출부가 정한다). */
  onFatal?: (reason: string) => Promise<void> | void
  retryDelaysMs?: readonly number[]
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

export interface TelegramPolling {
  /** 지금 폴링 중인 인스턴스(없으면 undefined). */
  current(): Bot | undefined
  stop(): Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms).unref())

/** 곁가지로 시작한다 — 돌려받은 핸들은 바로 쓸 수 있고, 폴링은 뒤에서 돈다. 이 함수는 throw 하지 않는다. */
export function startTelegramPolling(opts: TelegramPollingOptions): TelegramPolling {
  const delays = opts.retryDelaysMs ?? TELEGRAM_RETRY_DELAYS_MS
  const sleep = opts.sleep ?? defaultSleep
  const now = opts.now ?? Date.now
  let stopped = false
  let bot: Bot | undefined

  if (opts.createBot === undefined || opts.disabled) {
    console.log(
      opts.createBot === undefined
        ? '[bot] 텔레그램 토큰 없음 — 폴링 안 함(크론·Discord 는 그대로)'
        : '[bot] 텔레그램 폴링 꺼짐(TELEGRAM_POLLING=off)',
    )
    opts.state.write('off')
    return { current: () => undefined, stop: async () => {} }
  }
  const createBot = opts.createBot

  const loop = async () => {
    // 직전 상태가 '켜짐' 이 아니면(꺼짐 · 처음 · 읽기 실패) 밀린 업데이트를 버린다
    let drop = opts.state.read() !== 'on'
    let failures = 0
    while (!stopped) {
      let startedAt: number | undefined
      try {
        const b = createBot()
        bot = b
        b.catch((err) => console.error(`[bot] update handler 에러: ${sanitizeError(err)}`))
        await b.start({
          drop_pending_updates: drop,
          onStart: (info) => {
            console.log(`[bot] @${info.username} 초기화 완료`)
            console.log(`[bot] Long polling 시작${drop ? ' (밀린 업데이트 버림 — 직전에 꺼져 있었다)' : ''}`)
            opts.state.write('on')
            drop = false
            startedAt = now()
          },
        })
        if (stopped) return
        // grammY 는 stop 말고는 여기 오지 않는다 — 와도 간격 없이 다시 붙지 않게 첫 간격을 쉰다(사전 리뷰 info 1)
        console.warn('[bot] Long polling 이 끝났다 — 다시 시작한다')
        await sleep(delays[0])
      } catch (err) {
        if (stopped) return
        if (isUnauthorized(err)) {
          console.error(`[bot] 텔레그램 토큰 무효(401) — 폴링을 멈춘다(크론·Discord 는 그대로): ${sanitizeError(err)}`)
          bot = undefined
          // 멈춘 동안 쌓인 명령을 토큰 교체 뒤 늦게 실행하지 않게 — 다음 기동이 버리도록 꺼짐으로 남긴다(사전 리뷰 major 1 · 1-5)
          opts.state.write('off')
          await Promise.resolve(opts.onFatal?.('텔레그램 토큰 무효(401)')).catch((e: unknown) =>
            console.error(`[bot] 텔레그램 중지 알림 실패: ${sanitizeError(e)}`),
          )
          return
        }
        // 충분히 오래 폴링한 뒤의 실패만 처음 간격부터 — onStart 직후 409 가 되풀이되면 간격이 늘어난다
        if (startedAt !== undefined && now() - startedAt >= TELEGRAM_STABLE_RUN_MS) failures = 0
        const wait = delays[Math.min(failures, delays.length - 1)]
        failures += 1
        console.error(`[bot] Long polling 비정상 종료 — ${wait} ms 뒤 다시: ${sanitizeError(err)}`)
        await sleep(wait)
      }
    }
  }
  void loop().catch((err) => console.error(`[bot] 텔레그램 폴링 루프 오류: ${sanitizeError(err)}`))

  return {
    current: () => bot,
    async stop() {
      stopped = true
      const b = bot
      bot = undefined
      if (b?.isRunning()) await b.stop()
    },
  }
}
