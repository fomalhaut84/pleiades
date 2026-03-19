/**
 * 월 적립 리마인더
 * 매월 1일 09:00 KST
 */

import { prisma } from '@/lib/prisma'
import { getBot } from '@/bot/index'
import { isGiftSource } from '@/lib/tax/gift-tax'
import { accountEmoji, formatKRWFull } from '@/bot/utils/formatter'
import { sendHtml, escapeHtml, h } from '@/bot/utils/telegram'

export async function sendMonthlyReminder(chatIds: number[]): Promise<void> {
  const bot = getBot()

  const now = new Date()
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  const year = kst.getFullYear()
  const month = kst.getMonth() + 1

  const accounts = await prisma.account.findMany({
    include: {
      holdings: { select: { shares: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  const lines = [`💰 ${h.b(year + '년 ' + month + '월 적립 리마인더')}\n`]

  for (const account of accounts) {
    const holdingCount = account.holdings.length
    lines.push(`${accountEmoji(account.name)} ${h.b(escapeHtml(account.name))}: ${holdingCount}개 종목 보유`)
  }

  // 이번 달 입금/증여 현황 (KST 월 경계 → UTC 변환)
  const startOfMonth = new Date(Date.UTC(year, month - 1, 1, -9)) // KST 00:00 → UTC
  const endOfMonth = new Date(Date.UTC(year, month, 1, -9))

  const monthDeposits = await prisma.deposit.findMany({
    where: {
      depositedAt: { gte: startOfMonth, lt: endOfMonth },
    },
    include: { account: { select: { name: true } } },
  })

  if (monthDeposits.length > 0) {
    lines.push(`\n📊 ${h.b('이번 달 입금/증여:')}`)
    for (const d of monthDeposits) {
      const isGift = isGiftSource(d.source)
      const sourceLabel = isGift ? '증여' : '입금'
      lines.push(`  ${escapeHtml(d.account.name)}: ${formatKRWFull(d.amount)} (${sourceLabel})`)
    }
  }

  lines.push(`\n📌 ${h.b('체크리스트:')}`)
  lines.push('  • 소담/다솜 월 적립금 입금')
  lines.push('  • 적립식 ETF 매수')
  lines.push('  • 증여 기록 확인')

  const fullMessage = lines.join('\n')

  for (const chatId of chatIds) {
    try {
      await sendHtml(bot, chatId, fullMessage)
    } catch (error) {
      console.error(`[notification] 월 적립 리마인더 발송 실패 (chatId: ${chatId}):`, error)
    }
  }

  console.log('[notification] 월 적립 리마인더 발송 완료')
}
