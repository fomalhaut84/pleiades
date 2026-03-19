/**
 * RSU 베스팅일 + 스톡옵션 행사 가능일 리마인더
 * 매일 09:00 KST 실행, D-7 / D-1 대상 확인
 */

import { prisma } from '@/lib/prisma'
import { getBot } from '@/bot/index'
import { formatKRWFull } from '@/bot/utils/formatter'
import { sendHtml, escapeHtml, h } from '@/bot/utils/telegram'

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

export async function sendRSUReminders(chatIds: number[]): Promise<void> {
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

  // RSU 베스팅 확인 (D-1 ~ D-7 범위만 조회)
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
        `  기준가: ${formatKRWFull(rsu.basisValue)}`
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

  if (lines.length === 0) return

  const fullMessage = `🔔 ${h.b('RSU/스톡옵션 리마인더')}\n\n${lines.join('\n\n')}`

  for (const chatId of chatIds) {
    try {
      await sendHtml(bot, chatId, fullMessage)
    } catch (error) {
      console.error(`[notification] RSU 리마인더 발송 실패 (chatId: ${chatId}):`, error)
    }
  }

  console.log('[notification] RSU/스톡옵션 리마인더 발송 완료')
}
