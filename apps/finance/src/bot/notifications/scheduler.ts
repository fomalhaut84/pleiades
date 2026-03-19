/**
 * 텔레그램 알림 스케줄러
 * cron.ts에서 호출하여 알림 cron job 등록.
 */

import cron from 'node-cron'
import { prisma } from '@/lib/prisma'
import { sendQuarterlyReminder } from './quarterly'
import { sendRSUReminders } from './rsu'
import { sendMonthlyReminder } from './monthly'
import { sendDailySummary } from './daily'
import { sendMonthlyReport } from './monthly-report'
import { sendBriefing } from './briefing'

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
    // 일일 포트폴리오 요약: 매시 정각 체크 → AlertConfig.daily_summary_hour 매칭 시 발송
    cron.schedule(
      '0 * * * *',
      async () => {
        try {
          const config = await prisma.alertConfig.findUnique({
            where: { key: 'daily_summary_hour' },
          })
          const rawHour = parseInt(config?.value ?? '8', 10)
          const hour = Number.isInteger(rawHour) && rawHour >= 0 && rawHour <= 23
            ? rawHour : 8
          const now = new Date()
          const kstHour = (now.getUTCHours() + 9) % 24
          if (kstHour === hour) {
            await sendDailySummary(chatIds)
          }
        } catch (error) {
          console.error('[notification] 일일 요약 실패:', error)
        }
      },
      { timezone: 'Asia/Seoul' }
    )

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

    // 월간 리포트: 매일 09:30 KST → monthly_report_day 매칭 시 발송
    cron.schedule(
      '30 9 * * *',
      async () => {
        try {
          const config = await prisma.alertConfig.findUnique({
            where: { key: 'monthly_report_day' },
          })
          const rawDay = parseInt(config?.value ?? '1', 10)
          const configDay = Number.isInteger(rawDay) && rawDay >= 1 && rawDay <= 31
            ? rawDay : 1
          const now = new Date()
          const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
          // 말일 보정: 설정일이 해당 월 일수 초과 시 말일에 발송
          const daysInMonth = new Date(kst.getFullYear(), kst.getMonth() + 1, 0).getDate()
          const day = Math.min(configDay, daysInMonth)
          if (kst.getDate() === day) {
            await sendMonthlyReport(chatIds)
          }
        } catch (error) {
          console.error('[notification] 월간 리포트 실패:', error)
        }
      },
      { timezone: 'Asia/Seoul' }
    )

    // 모닝 브리핑: 한국장 08:30 KST (월~금)
    cron.schedule(
      '30 8 * * 1-5',
      async () => {
        try {
          await sendBriefing(chatIds, 'KR')
        } catch (error) {
          console.error('[notification] 한국장 브리핑 실패:', error)
        }
      },
      { timezone: 'Asia/Seoul' }
    )

    // 모닝 브리핑: 미국장 23:00 KST (월~금)
    cron.schedule(
      '0 23 * * 1-5',
      async () => {
        try {
          await sendBriefing(chatIds, 'US')
        } catch (error) {
          console.error('[notification] 미국장 브리핑 실패:', error)
        }
      },
      { timezone: 'Asia/Seoul' }
    )

    scheduled = true
    console.log('[notification] 알림 스케줄러 등록 (일일요약 + 브리핑 + 분기점검 + RSU + 월적립 + 월간리포트)')
  } catch (error) {
    console.error('[notification] 알림 스케줄러 등록 실패:', error)
  }
}
