/**
 * pleiades 009 D-5 B3a (pleiades#509) — 판단 함수(decide*) 흐름 테스트용 기록 출력.
 *
 * 판단은 플랫폼을 모른다(`../../core/reply`). 여기 가짜 출력은 판단이 부른 단계를 **순서대로 한 줄(`steps`)** 에 남긴다:
 *   ['reply', text, format, buttons?]  · ['long', html] · ['file', name, contentType, caption?]
 *   ['toast', text?] · ['removeButtons'] · ['edit', text, format, buttons?]
 * 버튼은 `[label, action]` 행 배열이다(빈 행도 그대로 — 버리는 것은 Discord 어댑터의 일이다).
 * typing 은 타이머로 끼어들므로 `steps` 밖에서 센다(`typing` mock).
 *
 * 옛 텔레그램 특성 테스트(`*-telegram.test.ts`)의 호출열을 같은 순서 · 같은 본문으로 옮긴 것이다 — 어댑터만 빠졌다.
 */

import { vi } from 'vitest'
import type { BotReply, ButtonOutput, ButtonPress, MessageKey, ReplyButtonRows, ReplyOutput, Requester } from '../../core/reply'
import { discordMessageKey } from '../../core/state-key'

export type Step = [string, ...unknown[]]

/** 판단의 기본 typing 주기 — 옛 텔레그램 테스트의 5 s 를 그대로 쓴다(주기는 출력이 정한다). */
export const FLOW_TYPING_INTERVAL_MS = 5000

/** 기록 채널 — 메시지 키 `discord:<채널>:<번호>`. */
export const FLOW_CHANNEL = 'c1'

let nextMessageId = 1000

/** 버튼 행 → `[label, action]` 행. */
export function rowsOf(rows: ReplyButtonRows | undefined): [string, string][][] {
  return (rows ?? []).map((row) => row.map((b) => [b.label, b.action] as [string, string]))
}

function messageStep(kind: 'reply' | 'edit', message: BotReply): Step {
  return message.buttons ? [kind, message.text, message.format, rowsOf(message.buttons)] : [kind, message.text, message.format]
}

export interface RecordingOutputOptions {
  /** 메시지 키를 만드는 채널 — 생략하면 `FLOW_CHANNEL` */
  channelId?: string
  typingIntervalMs?: number
}

/** 메시지 응답 기록 — reply 는 새 메시지 키를 돌려주고(버튼 대기 상태가 이 키에 묶인다) `keys` 에 순서대로 남긴다. */
export function recordingOutput(opts: RecordingOutputOptions = {}) {
  const channelId = opts.channelId ?? FLOW_CHANNEL
  const steps: Step[] = []
  const keys: MessageKey[] = []
  const typing = vi.fn(async () => undefined)
  const out: ReplyOutput = {
    reply: vi.fn(async (message: BotReply) => {
      steps.push(messageStep('reply', message))
      const key = discordMessageKey(channelId, String(nextMessageId++))
      keys.push(key)
      return key
    }),
    replyLong: vi.fn(async (html: string) => {
      steps.push(['long', html])
    }),
    replyFile: vi.fn(async (file) => {
      steps.push(file.caption === undefined ? ['file', file.name, file.contentType] : ['file', file.name, file.contentType, file.caption])
    }),
    typing,
    typingIntervalMs: opts.typingIntervalMs ?? FLOW_TYPING_INTERVAL_MS,
  }
  return { out, steps, keys, typing }
}

/** 버튼 응답 기록 — toast · removeButtons · edit 를 같은 줄에. */
export function recordingButtons() {
  const steps: Step[] = []
  const out: ButtonOutput = {
    toast: vi.fn(async (text?: string) => {
      steps.push(text === undefined ? ['toast'] : ['toast', text])
    }),
    removeButtons: vi.fn(async () => {
      steps.push(['removeButtons'])
    }),
    edit: vi.fn(async (message: BotReply) => {
      steps.push(messageStep('edit', message))
    }),
  }
  return { out, steps }
}

/** 요청자 — 본인 확인 값과 DB 표기를 따로 줄 수 있다(생략하면 같은 값). */
export function requester(userId = '7', dbUserId = userId): Requester {
  return { userId, dbUserId }
}

/** 기본 누른 사람 — `requester()` 기본값과 같다(본인). */
export const DEFAULT_CLICKER = '7'

/**
 * 눌린 버튼 — 메시지 키 · 누른 사람. 둘째 인자를 **생략**하면 본인(`DEFAULT_CLICKER`) · `undefined` 를 **넘기면** 누른 사람 없음(거부).
 * 기본 인자를 쓰지 않는다 — JS 기본 인자는 명시한 undefined 도 바꿔 "누른 사람 없음" 테스트가 조용히 본인 클릭이 된다(B3a 이관 중 실측).
 */
export function press(messageKey: MessageKey | undefined, ...clicker: [] | [string | undefined]): ButtonPress {
  return { messageKey, clickerId: clicker.length === 0 ? DEFAULT_CLICKER : clicker[0] }
}

/** reply 단계의 n 번째가 단 버튼 action 들. */
export function replyActions(steps: Step[], n = 0): string[] {
  const replies = steps.filter((s) => s[0] === 'reply')
  const rows = replies[n]?.[3] as [string, string][][] | undefined
  return rows ? rows.flat().map(([, action]) => action) : []
}

/** fire-and-forget 작업을 끝까지 흘린다. */
export async function flush(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setImmediate(r))
}
