/**
 * RSU 베스팅일 + 스톡옵션 행사 가능일 리마인더.
 *
 * - `sendRSUReminders` (매일 09:00 KST): D-7 / D-1 정보성 알림만 발송.
 *   → 사용자가 베스팅 임박을 미리 인지.
 * - `sendRSUVestConfirmations` (매일 15:35 KST): D-day RSU pending 만 발송 +
 *   inline keyboard ([✅ 확정] [✖️ 취소]) 첨부 → 한 번 탭으로 vest 처리.
 *   → KRX 마감(15:30) + 안전 마진 후라 yahoo historical 종가 확정 시점.
 *
 * callback 처리는 notifications/discord-interactions.ts(Discord gateway · #155) → 판단 src/bot/commands/vest-confirm.ts(decideVest).
 */

import type { ButtonRows } from '@pleiades/notify'
import { prisma } from '@/lib/prisma'
import type { ReplyCard } from '@/bot/core/reply'
import { interactiveNotifierFor, notifierFor, Route, NOTIFY_CTX } from './notifier'
import { optionReminderCard, rsuDdayContent, rsuReminderCard, type DdayPrice } from './cards'
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

/** D-day RSU 확정 버튼. 받는 쪽은 `decideVest` 다. */
export function buildVestButtons(rsuId: string): ButtonRows {
  return [[
    { label: '✅ 확정', action: `vest:confirm:${rsuId}` },
    { label: '✖️ 취소', action: `vest:cancel:${rsuId}` },
  ]]
}

/**
 * 09:00 KST cron — D-7 / D-1 정보성 알림.
 * D-day 처리 키보드는 마감 후 sendRSUVestConfirmations 가 발송.
 */
export async function sendRSUReminders(): Promise<void> {
  // 013 P3-b2 (#779) — 항목마다 카드 1장(`./cards`) · 10장을 넘으면 notify 가 행 목록 글로 대체한다
  const cards: ReplyCard[] = []

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
      cards.push(rsuReminderCard({
        daysLeft,
        accountName: rsu.account.name,
        shares: rsu.shares,
        vestingDate: formatDate(rsu.vestingDate),
        basisValue: rsu.basisValue,
      }))
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
      cards.push(optionReminderCard({
        daysLeft,
        name: vest.stockOption.displayName,
        shares: vest.shares,
        strikePrice: vest.stockOption.strikePrice,
        vestingDate: formatDate(vest.vestingDate),
      }))
    }
  }

  if (cards.length === 0) {
    console.log('[notification] RSU/스톡옵션 리마인더 대상 없음')
    return
  }

  await notifierFor().notify(Route.ALLOWED, { text: `🔔 RSU/스톡옵션 리마인더 · ${cards.length}건`, format: 'plain', cards }, NOTIFY_CTX)
  console.log('[notification] RSU/스톡옵션 리마인더 발송 완료')
}

/**
 * 15:35 KST cron — D-day RSU pending 만 발송 + inline keyboard 첨부.
 * KRX 마감(15:30) + 안전 마진 5분 후라 yahoo historical daily candle 의 종가 확정 보장.
 *
 * 사용자는 [✅ 확정] 한 번 탭으로 처리 — 종가는 자동 조회.
 */
export async function sendRSUVestConfirmations(): Promise<void> {

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
    let price: DdayPrice = { kind: 'missing' }
    let sellShares = rsu.sellShares ?? 0
    let autoSell = sellShares > 0
    try {
      const preview = await getRsuVestPreview(rsu.id)
      price = preview.vestPrice != null ? { kind: 'ok', value: preview.vestPrice, source: preview.vestPriceSource } : { kind: 'missing' }
      autoSell = preview.autoSellDefault
      sellShares = preview.sellShares ?? 0
    } catch (err) {
      console.error(`[notification] vest-preview 실패 (${rsu.id}): ${sanitizeError(err)}`)
      price = { kind: 'error' }
    }

    const keyboard = buildVestButtons(rsu.id)

    // 003 Q27 흡수(사용자 2026-10-15): 재시도·plain 폴백을 파사드가 소유 — 키보드는 폴백에도 유지된다.
    // 중복 전송 시 버튼을 두 번 눌러도 rsu-vest-service 의 ALREADY_VESTED 가 이중 반영을 막는다.
    // 013 P3-b2 (#779) — 위 한 줄 + 처리 정보 카드 + 버튼(`./cards`)
    const content = rsuDdayContent(
      { accountName: rsu.account.name, shares: rsu.shares, vestingDate: formatDate(rsu.vestingDate), basisValue: rsu.basisValue, price, sellShares, autoSell },
      keyboard,
    )
    const r = await interactiveNotifierFor().notify(Route.ALLOWED, content, NOTIFY_CTX)
    if (r.total === 0) {
      // 버튼은 fin Discord 봇으로 — 봇 토큰·채널이 비었다(#155)
      console.warn(`[notification] D-day RSU 확정 알림 수신자 0 — Discord 봇 설정 미비 (${rsu.id})`)
    }
  }
  console.log(`[notification] D-day RSU 확정 알림 발송 완료 (${todayRsus.length}건)`)
}
