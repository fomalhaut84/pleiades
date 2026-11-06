/**
 * 봇 프로세스 standalone 진입점
 *
 * Next.js와 분리된 별도 프로세스로 실행.
 * - cron 작업 (주가갱신, 스냅샷, KRX, 반복거래)
 * - 알림 스케줄러 (일일요약, 브리핑, 분기점검 등)
 * - Discord gateway(메시지·버튼 수신 — `./discord/router`)
 * 텔레그램 폴링은 지웠다(009 D-5 B3b · pleiades#508).
 */

import 'dotenv/config'
import { schedulePriceUpdates, scheduleSnapshots, scheduleKrxSync, scheduleRecurring, scheduleVestingStatusUpdate, scheduleEarningsScan, scheduleBenchmarkRefresh } from '@/lib/cron'
import { scheduleNotifications } from './notifications/scheduler'
import { startDiscordInteractions } from './notifications/discord-interactions'
import { sanitizeError } from './utils/error'

/** 빌드 스모크 전용(scripts/smoke-bot-bundle.mjs) — 진입 로그만 찍고 어떤 등록·토큰·DB·gateway 보다 먼저 끝낸다. 운영 pm2 정의에는 없다 */
const SMOKE_ARG = '--smoke'

async function main(): Promise<void> {
  console.log('[bot] standalone 프로세스 시작...')
  if (process.argv.includes(SMOKE_ARG)) {
    console.log('[bot] --smoke — 등록 없이 종료')
    process.exit(0)
  }

  // cron/scheduler 등록
  schedulePriceUpdates()
  scheduleSnapshots()
  scheduleKrxSync()
  scheduleRecurring()
  scheduleVestingStatusUpdate()
  scheduleEarningsScan()
  scheduleBenchmarkRefresh()
  scheduleNotifications()
  console.log('[bot] cron + 알림 스케줄러 등록 완료')

  // pleiades M-6b-4 (pleiades#155): Discord 수신(gateway) — 봇 토큰·채널이 있을 때만
  const discordGateway = startDiscordInteractions()

  // graceful shutdown
  const shutdown = async () => {
    console.log('[bot] 종료 중...')
    discordGateway?.stop()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error(`[bot] 시작 실패: ${sanitizeError(err)}`)
  process.exit(1)
})
