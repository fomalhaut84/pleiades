/**
 * 텔레그램 알림 스케줄러
 * cron.ts에서 호출하여 알림 cron job 등록.
 */

import cron from 'node-cron'
import { prisma } from '@/lib/prisma'
import { sendQuarterlyReminder } from './quarterly'
import { sendRSUReminders, sendRSUVestConfirmations } from './rsu'
import { sendClosingReview, sendWeeklyReview, ensureActiveReviewSetting } from './active-review'
import { sendMonthlyReminder } from './monthly'
import { sendDailySummary } from './daily'
import { sendMonthlyReport } from './monthly-report'
import { sendBriefing } from './briefing'
import { takeNetWorthSnapshot } from './networth-snapshot'
import { sendQuarterlyReport } from './quarterly-report'

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

  // active_review AlertConfig 키를 배포 직후 즉시 upsert — 첫 클로징/주간 cron 실행
  // 전에 사용자가 PUT /api/alerts/config 로 off 설정 가능하도록 (라우트가 존재하지 않는
  // 키는 404). 실패는 log 만, cron 등록은 계속 진행.
  ensureActiveReviewSetting().catch((error) => {
    console.error('[notification] ensureActiveReviewSetting 실패:', error)
  })

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

    // 분기 리포트 PDF: 1/4/7/10월 7일 10:00 KST (분기 점검 1주 후)
    cron.schedule(
      '0 10 7 1,4,7,10 *',
      async () => {
        try {
          await sendQuarterlyReport(chatIds)
        } catch (error) {
          console.error('[notification] 분기 리포트 실패:', error)
        }
      },
      { timezone: 'Asia/Seoul' }
    )

    // RSU/스톡옵션 리마인더: 매일 09:00 KST (D-7 / D-1 정보성)
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

    // RSU D-day 확정 알림: 매일 15:35 KST (KRX 마감 15:30 + 안전 마진).
    // 종가가 yahoo historical 에 확정된 후이므로 inline keyboard [확정] 한 번 탭으로 처리 가능.
    cron.schedule(
      '35 15 * * *',
      async () => {
        try {
          await sendRSUVestConfirmations(chatIds)
        } catch (error) {
          console.error('[notification] D-day RSU 확정 알림 실패:', error)
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

    // 순자산 스냅샷: 매월 1일 06:30 KST (스냅샷 후 월적립 리마인더)
    cron.schedule(
      '30 6 1 * *',
      async () => {
        try {
          await takeNetWorthSnapshot(chatIds)
        } catch (error) {
          console.error('[notification] 순자산 스냅샷 실패:', error)
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

    // 한국장 클로징 리뷰: 15:40 KST 월~금 (KRX 마감 15:30 + 마진 10분)
    cron.schedule(
      '40 15 * * 1-5',
      async () => {
        try {
          await sendClosingReview(chatIds, 'KR')
        } catch (error) {
          console.error('[notification] 한국장 클로징 리뷰 실패:', error)
        }
      },
      { timezone: 'Asia/Seoul' }
    )

    // 미국장 클로징 리뷰: 07:15 KST 화~토
    // 미국장 마감은 DST 여부에 따라 달라짐:
    //  - EDT (3~11월): 05:00 KST 마감 → 07:15 는 135분 마진
    //  - EST (11~3월): 06:00 KST 마감 → 07:15 는 75분 마진 (yahoo daily candle 확정 안전)
    // 화~토인 이유: 월(KST) = 일(EST) → 마감 없음. 화~금 = 미국장 월~목 마감, 토 = 미국장 금 마감.
    cron.schedule(
      '15 7 * * 2-6',
      async () => {
        try {
          await sendClosingReview(chatIds, 'US')
        } catch (error) {
          console.error('[notification] 미국장 클로징 리뷰 실패:', error)
        }
      },
      { timezone: 'Asia/Seoul' }
    )

    // 주간 리뷰: 매주 토 09:00 KST — 지난주 회고 + 다음주 캘린더
    cron.schedule(
      '0 9 * * 6',
      async () => {
        try {
          await sendWeeklyReview(chatIds)
        } catch (error) {
          console.error('[notification] 주간 리뷰 실패:', error)
        }
      },
      { timezone: 'Asia/Seoul' }
    )

    scheduled = true
    console.log('[notification] 알림 스케줄러 등록 (일일요약 + 브리핑 + 클로징 + 주간 + 순자산 + 분기점검 + RSU + 월적립 + 월간리포트)')
  } catch (error) {
    console.error('[notification] 알림 스케줄러 등록 실패:', error)
  }
}
