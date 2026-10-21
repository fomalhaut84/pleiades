/**
 * RSU 베스팅일 + 스톡옵션 행사 가능일 리마인더.
 *
 * - `sendRSUReminders` (매일 09:00 KST): D-7 / D-1 정보성 알림만 발송.
 *   → 사용자가 베스팅 임박을 미리 인지.
 * - `sendRSUVestConfirmations` (매일 15:35 KST): D-day RSU pending 만 발송 +
 *   inline keyboard ([✅ 확정] [✖️ 취소]) 첨부 → 한 번 탭으로 vest 처리.
 *   → KRX 마감(15:30) + 안전 마진 후라 yahoo historical 종가 확정 시점.
 *
 * callback 처리는 src/bot/commands/vest-confirm.ts(텔레그램) · notifications/discord-interactions.ts(Discord · #155).
 */

import { InlineKeyboard } from 'grammy'
import { prisma } from '@/lib/prisma'
import { getBot } from '@/bot/index'
import { formatKRWFull } from '@/bot/utils/formatter'
import { escapeHtml, h } from '@/bot/utils/telegram'
import { interactiveNotifierFor, notifierFor, Route, htmlContent, NOTIFY_CTX } from './notifier'
import { getRsuVestPreview } from '@/lib/rsu-vest-service'
import { sanitizeError } from '@/bot/utils/error'

function formatDate(date: Date): string {
  return date.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })
}

function diffDays(target: Date): number {
  const now = new Date()
  const kstNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  const kstTarget = new Date(target.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))

  // 날짜만 비교 (시간 제거)
  kstNow.setHours(0, 0, 0, 0)
  kstTarget.setHours(0, 0, 0, 0)

  return Math.round((kstTarget.getTime() - kstNow.getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * 09:00 KST cron — D-7 / D-1 정보성 알림.
 * D-day 처리 키보드는 마감 후 sendRSUVestConfirmations 가 발송.
 */
export async function sendRSUReminders(): Promise<void> {
  const bot = getBot()
  const lines: string[] = []

  // D-7 ~ D-1 범위 (KST 기준 오늘 + 1일 ~ 오늘 + 7일)
  const now = new Date()
  const kstNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  kstNow.setHours(0, 0, 0, 0)
  const rangeStart = new Date(kstNow)
  rangeStart.setDate(rangeStart.getDate() + 1)
  const rangeEnd = new Date(kstNow)
  rangeEnd.setDate(rangeEnd.getDate() + 8) // D-7 포함 (exclusive upper bound)

  // RSU 베스팅 (D-7 / D-1 정보성)
  const pendingRSU = await prisma.rSUSchedule.findMany({
    where: {
      status: 'pending',
      vestingDate: { gte: rangeStart, lt: rangeEnd },
    },
    include: { account: { select: { name: true } } },
    orderBy: { vestingDate: 'asc' },
  })

  for (const rsu of pendingRSU) {
    const daysLeft = diffDays(rsu.vestingDate)
    if (daysLeft === 7 || daysLeft === 1) {
      const label = daysLeft === 1 ? '⚠️ D-1' : '📅 D-7'
      lines.push(
        `${h.b(label + ' RSU 베스팅')}\n` +
        `  ${escapeHtml(rsu.account.name)} | ${rsu.shares}주\n` +
        `  베스팅일: ${formatDate(rsu.vestingDate)}\n` +
        `  기준가: ${formatKRWFull(rsu.basisValue)}` +
        (daysLeft === 1 ? `\n  <i>내일 15:35 KST 이후 [확정] 알림 발송됨</i>` : '')
      )
    }
  }

  // 스톡옵션 행사 가능일 확인 (D-1 ~ D-7 범위만 조회)
  const pendingOptions = await prisma.stockOptionVesting.findMany({
    where: {
      status: 'pending',
      vestingDate: { gte: rangeStart, lt: rangeEnd },
    },
    include: {
      stockOption: {
        select: { displayName: true, strikePrice: true },
      },
    },
    orderBy: { vestingDate: 'asc' },
  })

  for (const vest of pendingOptions) {
    const daysLeft = diffDays(vest.vestingDate)
    if (daysLeft === 7 || daysLeft === 1) {
      const label = daysLeft === 1 ? '⚠️ D-1' : '📅 D-7'
      lines.push(
        `${h.b(label + ' 스톡옵션 행사 가능')}\n` +
        `  ${escapeHtml(vest.stockOption.displayName)} | ${vest.shares}주\n` +
        `  행사가: ${formatKRWFull(vest.stockOption.strikePrice)}\n` +
        `  행사 가능일: ${formatDate(vest.vestingDate)}`
      )
    }
  }

  if (lines.length === 0) {
    console.log('[notification] RSU/스톡옵션 리마인더 대상 없음')
    return
  }

  const fullMessage = `🔔 ${h.b('RSU/스톡옵션 리마인더')}\n\n${lines.join('\n\n')}`
  await notifierFor(bot).notify(Route.ALLOWED, htmlContent(fullMessage), NOTIFY_CTX)
  console.log('[notification] RSU/스톡옵션 리마인더 발송 완료')
}

/**
 * 15:35 KST cron — D-day RSU pending 만 발송 + inline keyboard 첨부.
 * KRX 마감(15:30) + 안전 마진 5분 후라 yahoo historical daily candle 의 종가 확정 보장.
 *
 * 사용자는 [✅ 확정] 한 번 탭으로 처리 — 종가는 자동 조회.
 */
export async function sendRSUVestConfirmations(): Promise<void> {
  const bot = getBot()

  // D-day (KST 기준 오늘)
  const now = new Date()
  const kstNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  kstNow.setHours(0, 0, 0, 0)
  const todayStart = new Date(kstNow)
  const todayEnd = new Date(kstNow)
  todayEnd.setDate(todayEnd.getDate() + 1)

  const todayRsus = await prisma.rSUSchedule.findMany({
    where: {
      status: 'pending',
      vestingDate: { gte: todayStart, lt: todayEnd },
    },
    include: { account: { select: { name: true } } },
    orderBy: { vestingDate: 'asc' },
  })

  if (todayRsus.length === 0) return

  for (const rsu of todayRsus) {
    let priceLine = `  종가: <i>조회 중...</i>`
    let autoSellLine = (rsu.sellShares ?? 0) > 0
      ? `  매도 예정: ${rsu.sellShares}주 (autoSell=✓)`
      : `  매도 예정: 없음 (autoSell=✗)`
    try {
      const preview = await getRsuVestPreview(rsu.id)
      if (preview.vestPrice != null) {
        priceLine = `  종가 (자동조회): ${formatKRWFull(Math.round(preview.vestPrice))} <i>(${preview.vestPriceSource})</i>`
      } else {
        priceLine = `  종가: <i>자동 조회 실패 — 웹에서 직접 처리</i>`
      }
      autoSellLine = preview.autoSellDefault
        ? `  매도 예정: ${preview.sellShares ?? 0}주 (autoSell=✓)`
        : `  매도 예정: 없음 (autoSell=✗)`
    } catch (err) {
      console.error(`[notification] vest-preview 실패 (${rsu.id}): ${sanitizeError(err)}`)
      priceLine = `  종가: <i>조회 실패</i>`
    }

    const msg =
      `🎯 ${h.b('D-day RSU 베스팅 — 오늘 처리 가능')}\n` +
      `  ${escapeHtml(rsu.account.name)} | ${rsu.shares}주\n` +
      `  베스팅일: ${formatDate(rsu.vestingDate)}\n` +
      `  기준가: ${formatKRWFull(rsu.basisValue)}\n` +
      `${priceLine}\n` +
      `${autoSellLine}\n\n` +
      `<i>아래 [확정] 한 번 탭으로 BUY/SELL Trade + Holding 자동 반영됩니다.</i>`

    const keyboard = new InlineKeyboard()
      .text('✅ 확정', `vest:confirm:${rsu.id}`)
      .text('✖️ 취소', `vest:cancel:${rsu.id}`)

    // 003 Q27 흡수(사용자 2026-10-15): 재시도·plain 폴백을 파사드가 소유 — 키보드는 폴백에도 유지된다.
    // 중복 전송 시 버튼을 두 번 눌러도 rsu-vest-service 의 ALREADY_VESTED 가 이중 반영을 막는다.
    const r = await interactiveNotifierFor(bot).notify(Route.ALLOWED, htmlContent(msg, keyboard), NOTIFY_CTX)
    if (r.total === 0) {
      // 버튼 채널은 NOTIFY_INTERACTIVE_CHANNEL — 텔레그램이면 chat id, Discord 면 fin 봇 토큰·채널이 비었다(#155)
      console.warn(`[notification] D-day RSU 확정 알림 수신자 0 — TELEGRAM_ALLOWED_CHAT_IDS 또는 Discord 봇 설정 미비 (${rsu.id})`)
    }
  }
  console.log(`[notification] D-day RSU 확정 알림 발송 완료 (${todayRsus.length}건)`)
}
