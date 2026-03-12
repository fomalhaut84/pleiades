/**
 * 텔레그램 알림 스케줄러
 * cron.ts에서 호출하여 알림 cron job 등록.
 */

import cron from 'node-cron'
import { sendQuarterlyReminder } from './quarterly'
import { sendRSUReminders } from './rsu'
import { sendMonthlyReminder } from './monthly'

function getAllowedChatIds(): number[] {
  return (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => !isNaN(n))
}

let scheduled = false

export function scheduleNotifications(): void {
  if (scheduled) return

  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.log('[notification] TELEGRAM_BOT_TOKEN 미설정, 알림 스케줄 건너뜀')
    return
  }

  const chatIds = getAllowedChatIds()
  if (chatIds.length === 0) {
    console.log('[notification] TELEGRAM_ALLOWED_CHAT_IDS 미설정, 알림 스케줄 건너뜀')
    return
  }

  try {
    // 분기 점검: 1/4/7/10월 1일 09:00 KST
    cron.schedule(
      '0 9 1 1,4,7,10 *',
      async () => {
        try {
          await sendQuarterlyReminder(chatIds)
        } catch (error) {
          console.error('[notification] 분기 점검 실패:', error)
        }
      },
      { timezone: 'Asia/Seoul' }
    )

    // RSU/스톡옵션 리마인더: 매일 09:00 KST (D-7, D-1 대상만 발송)
    cron.schedule(
      '0 9 * * *',
      async () => {
        try {
          await sendRSUReminders(chatIds)
        } catch (error) {
          console.error('[notification] RSU/스톡옵션 리마인더 실패:', error)
        }
      },
      { timezone: 'Asia/Seoul' }
    )

    // 월 적립 리마인더: 매월 1일 09:00 KST
    cron.schedule(
      '0 9 1 * *',
      async () => {
        try {
          await sendMonthlyReminder(chatIds)
        } catch (error) {
          console.error('[notification] 월 적립 리마인더 실패:', error)
        }
      },
      { timezone: 'Asia/Seoul' }
    )

    scheduled = true
    console.log('[notification] 알림 스케줄러 등록 (분기점검 + RSU D-7/D-1 + 월적립)')
  } catch (error) {
    console.error('[notification] 알림 스케줄러 등록 실패:', error)
  }
}
