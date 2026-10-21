/**
 * "내 투자 이야기" 타임라인 이벤트 수집
 *
 * 거래, 배당, 증여 등 주요 이벤트를 아이 친화적 텍스트로 변환.
 */

import { prisma } from '@/lib/prisma'
import { getStockDescription, getDescriptionByName } from './stock-descriptions'

export interface TimelineEvent {
  date: string
  emoji: string
  title: string
  description: string
}

export async function collectTimeline(accountId: string): Promise<TimelineEvent[]> {
  const events: TimelineEvent[] = []

  // 거래 내역
  const trades = await prisma.trade.findMany({
    where: { accountId },
    orderBy: { tradedAt: 'asc' },
    select: { ticker: true, displayName: true, type: true, shares: true, tradedAt: true },
  })

  const firstTrade = trades[0]
  if (firstTrade) {
    events.push({
      date: firstTrade.tradedAt.toISOString().slice(0, 10),
      emoji: '🎉',
      title: '투자 시작!',
      description: `첫 번째 주식을 샀어!`,
    })
  }

  // 매수 이벤트 (첫 거래 제외)
  for (const t of trades.slice(1)) {
    if (t.type !== 'BUY') continue
    const desc = getStockDescription(t.ticker)
    const nameDesc = desc.emoji === '🏢' ? getDescriptionByName(t.displayName) : desc
    events.push({
      date: t.tradedAt.toISOString().slice(0, 10),
      emoji: nameDesc.emoji,
      title: `${t.displayName} ${t.shares}주 매수`,
      description: `${nameDesc.desc}의 주인이 되었어!`,
    })
  }

  // 배당금
  const dividends = await prisma.dividend.findMany({
    where: { accountId },
    orderBy: { payDate: 'asc' },
    select: { displayName: true, amountKRW: true, payDate: true },
  })

  for (const d of dividends) {
    events.push({
      date: d.payDate.toISOString().slice(0, 10),
      emoji: '🎁',
      title: '배당금 받았어!',
      description: `${d.displayName}에서 ${Math.round(d.amountKRW).toLocaleString('ko-KR')}원 용돈이 왔어`,
    })
  }

  // 증여 입금
  const deposits = await prisma.deposit.findMany({
    where: { accountId, source: { in: ['증여', 'gift'] } },
    orderBy: { depositedAt: 'asc' },
    select: { amount: true, depositedAt: true },
  })

  for (const d of deposits) {
    events.push({
      date: d.depositedAt.toISOString().slice(0, 10),
      emoji: '💝',
      title: '투자금 선물 받았어!',
      description: `${Math.round(d.amount).toLocaleString('ko-KR')}원이 들어왔어`,
    })
  }

  // 날짜순 정렬
  events.sort((a, b) => a.date.localeCompare(b.date))

  return events
}
