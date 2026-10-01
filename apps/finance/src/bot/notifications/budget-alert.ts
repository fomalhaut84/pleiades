/**
 * 예산 초과 / 증여 한도 경고
 *
 * - 소비 기록 후: 월 예산 사용률 체크 → budget_warn_pct 초과 시 알림
 * - 증여 입금 후: 비과세 한도 사용률 체크 → 80% 초과 시 알림
 */

import { prisma } from '@/lib/prisma'
import { getBot } from '@/bot/index'
import { calcGiftTaxSummary } from '@/lib/tax/gift-tax'
import { formatKRWFull } from '@/bot/utils/formatter'
import { sendHtml, escapeHtml, h } from '@/bot/utils/telegram'

function getAllowedChatIds(): number[] {
  return (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => !isNaN(n))
}

/**
 * 소비 기록 후 예산 사용률 체크
 * 임계값 초과 시 텔레그램 알림 발송
 */
export async function checkBudgetUsage(): Promise<void> {
  const chatIds = getAllowedChatIds()
  if (chatIds.length === 0) return

  // AlertConfig에서 임계값 조회
  const config = await prisma.alertConfig.findUnique({
    where: { key: 'budget_warn_pct' },
  })
  const warnPct = parseFloat(config?.value ?? '80')
  if (!Number.isFinite(warnPct)) return

  // 이번 달 기준 (KST)
  const now = new Date()
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  const year = kst.getFullYear()
  const month = kst.getMonth() + 1
  // KST 00:00 → UTC 변환
  const startDate = new Date(Date.UTC(year, month - 1, 1, -9))
  const endDate = new Date(Date.UTC(year, month, 1, -9))

  // 월 예산 (전체 예산 = categoryId null)
  const budget = await prisma.budget.findFirst({
    where: { categoryId: null, year, month },
  })
  const totalBudget = budget?.amount ?? 0
  if (totalBudget <= 0) return

  // 이번 달 소비 합산 (expense 카테고리만)
  const expenseCategories = await prisma.category.findMany({
    where: { type: 'expense' },
    select: { id: true },
  })
  const expenseCategoryIds = expenseCategories.map((c) => c.id)

  const result = await prisma.transaction.aggregate({
    where: {
      categoryId: { in: expenseCategoryIds },
      transactedAt: { gte: startDate, lt: endDate },
    },
    _sum: { amount: true },
  })
  const totalSpent = result._sum.amount ?? 0

  const usagePct = (totalSpent / totalBudget) * 100
  if (usagePct < warnPct) return

  const bot = getBot()
  const emoji = usagePct >= 100 ? '🚨' : '⚠️'
  const message =
    `${emoji} ${h.b('예산 경고')} (${year}년 ${month}월)\n\n` +
    `예산: ${formatKRWFull(totalBudget)}\n` +
    `소비: ${h.b(formatKRWFull(totalSpent))} (${usagePct.toFixed(0)}%)\n` +
    `남은 예산: ${formatKRWFull(totalBudget - totalSpent)}`

  for (const chatId of chatIds) {
    try {
      await sendHtml(bot, chatId, message)
    } catch (error) {
      console.error(`[notification] 예산 경고 발송 실패 (chatId: ${chatId}):`, error)
    }
  }
}

/**
 * 증여 입금 후 비과세 한도 체크
 * 사용률 80% 초과 시 텔레그램 알림 발송
 */
export async function checkGiftTaxLimit(accountId: string): Promise<void> {
  const chatIds = getAllowedChatIds()
  if (chatIds.length === 0) return

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { name: true, ownerAge: true },
  })
  if (!account || account.ownerAge == null || account.ownerAge >= 19) return

  const deposits = await prisma.deposit.findMany({
    where: { accountId },
    select: { amount: true, source: true, depositedAt: true },
  })

  const summary = calcGiftTaxSummary(deposits, true)
  if (summary.usageRate < 0.8) return

  const bot = getBot()
  const emoji = summary.usageRate >= 1.0 ? '🚨' : '⚠️'
  const pct = (summary.usageRate * 100).toFixed(0)
  const message =
    `${emoji} ${h.b('증여세 한도 경고')} (${escapeHtml(account.name)})\n\n` +
    `비과세 한도: ${formatKRWFull(summary.exemptLimit)}\n` +
    `10년 윈도우 증여 합계: ${h.b(formatKRWFull(summary.totalGifted))} (${pct}%)\n` +
    `잔여 한도: ${formatKRWFull(summary.remaining)}\n\n` +
    `${h.i('※ 참고용이며 법적 조언이 아닙니다.')}`

  for (const chatId of chatIds) {
    try {
      await sendHtml(bot, chatId, message)
    } catch (error) {
      console.error(`[notification] 증여세 경고 발송 실패 (chatId: ${chatId}):`, error)
    }
  }
}
