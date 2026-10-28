/**
 * 텔레그램 봇 standalone 진입점
 *
 * Next.js와 분리된 별도 프로세스로 실행.
 * - grammY long polling
 * - cron 작업 (주가갱신, 스냅샷, KRX, 반복거래)
 * - 알림 스케줄러 (일일요약, 브리핑, 분기점검 등)
 */

import 'dotenv/config'
import { getBot } from './index'
import { schedulePriceUpdates, scheduleSnapshots, scheduleKrxSync, scheduleRecurring, scheduleVestingStatusUpdate, scheduleEarningsScan, scheduleBenchmarkRefresh } from '@/lib/cron'
import { scheduleNotifications } from './notifications/scheduler'
import { startDiscordInteractions } from './notifications/discord-interactions'
import { BOT_PROCESS_WITHOUT_TELEGRAM, htmlContent, notifierFor, NOTIFY_CTX, Route, telegramTokenSet } from './notifications/notifier'
import { filePollingStateStore, pollingDisabled, startTelegramPolling } from './telegram-polling'
import { sanitizeError } from './utils/error'

// pleiades 009 D-1 (pleiades#349): 텔레그램은 기다리지 않는 곁가지다 — 크론·스케줄러·Discord gateway 가 먼저 뜨고,
// 텔레그램 토큰 부재·폴링 실패는 프로세스를 끝내지 않는다(재시작마다 Discord IDENTIFY 가 늘던 경로 · 009 R5).
const POLLING_STATE_FILE = 'logs/telegram-polling-fin.json'
/** 빌드 스모크 전용(scripts/smoke-bot-bundle.mjs) — 진입 로그만 찍고 어떤 등록·토큰·DB·gateway 보다 먼저 끝낸다. 운영 pm2 정의에는 없다 */
const SMOKE_ARG = '--smoke'

async function main(): Promise<void> {
  console.log('[bot] standalone 프로세스 시작...')
  if (process.argv.includes(SMOKE_ARG)) {
    console.log('[bot] --smoke — 등록 없이 종료')
    process.exit(0)
  }

  // cron/scheduler 등록 — 텔레그램과 무관하게 먼저(009 D-1 E1)
  schedulePriceUpdates()
  scheduleSnapshots()
  scheduleKrxSync()
  scheduleRecurring()
  scheduleVestingStatusUpdate()
  scheduleEarningsScan()
  scheduleBenchmarkRefresh()
  scheduleNotifications()
  console.log('[bot] cron + 알림 스케줄러 등록 완료')

  // 아웃바운드 핸들 — 토큰이 있으면 봇 싱글턴(텔레그램 라우트 · /브리핑 등 명령도 같은 인스턴스), 없으면 Discord 라우트만
  const hasToken = telegramTokenSet()
  const notifyBot = hasToken ? getBot() : BOT_PROCESS_WITHOUT_TELEGRAM

  // pleiades M-6b-4 (pleiades#155): Discord 버튼 수신(gateway) — 봇 토큰·채널이 있을 때만
  const discordGateway = startDiscordInteractions(notifyBot)

  // 폴링 인스턴스는 처음엔 싱글턴(명령 핸들러가 등록된 그것) — 실패 뒤 다시 시작할 때만 새로 만든다
  // (grammY 는 start 뒤 미들웨어 등록을 막으므로 같은 인스턴스를 다시 start 하지 않는다)
  let first = true
  const telegram = startTelegramPolling({
    createBot: hasToken
      ? () => {
          if (first) {
            first = false
            return getBot()
          }
          return getBot({ fresh: true })
        }
      : undefined,
    state: filePollingStateStore(POLLING_STATE_FILE),
    disabled: pollingDisabled(),
    // 401 로 텔레그램을 멈출 때 1회 — 텔레그램 토큰과 무관한 경로(Discord 라우트)로만 간다
    onFatal: async (reason) => {
      const r = await notifierFor(BOT_PROCESS_WITHOUT_TELEGRAM).notify(
        Route.ADMIN,
        htmlContent(`⚠️ <b>fin 텔레그램 수신 중단</b>\n${reason} — 크론·Discord 는 계속 돈다.`),
        NOTIFY_CTX,
      )
      if (r.sent === 0) console.warn(`[bot] 텔레그램 중지 알림 미전송 (sent=0/total=${r.total} — Discord 라우트가 아니면 수신자 0)`)
    },
  })

  // graceful shutdown
  const shutdown = async () => {
    console.log('[bot] 종료 중...')
    discordGateway?.stop()
    try {
      await telegram.stop()
    } catch (err) {
      console.error(`[bot] bot.stop() 에러: ${sanitizeError(err)}`)
    }
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error(`[bot] 시작 실패: ${sanitizeError(err)}`)
  process.exit(1)
})
