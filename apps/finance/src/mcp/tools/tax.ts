import { prisma } from '@/lib/prisma'
import { calcGiftTaxSummary } from '@/lib/tax/gift-tax'
import { formatDate, DEFAULT_FX_RATE_USD_KRW } from '@/lib/format'
import {
  resolveAccountId,
  toolResult,
  toolError,
  formatMoney,
} from '../utils'

/**
 * get_gift_tax_status: 증여세 현황 (소담/다솜 전용)
 */
export async function getGiftTaxStatus(args: {
  account_name: string
}) {
  try {
    const accountId = await resolveAccountId(args.account_name)
    if (accountId == null) {
      return toolError('계좌명을 지정해야 합니다 (소담 또는 다솜)')
    }

    const account = await prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { name: true, ownerAge: true },
    })

    const deposits = await prisma.deposit.findMany({
      where: { accountId },
      select: { amount: true, source: true, depositedAt: true },
    })

    if (account.ownerAge == null) {
      return toolError('계좌에 나이 정보가 설정되어 있지 않습니다.')
    }
    const isMinor = account.ownerAge < 19
    const summary = calcGiftTaxSummary(deposits, isMinor)

    const lines = [
      `## ${account.name} 증여세 현황`,
      `미성년 여부: ${isMinor ? '예' : '아니오'}`,
      `비과세 한도: ${formatMoney(summary.exemptLimit, 'KRW')}`,
      `10년 윈도우 증여 합계: ${formatMoney(summary.totalGifted, 'KRW')}`,
      `사용률: ${(summary.usageRate * 100).toFixed(1)}%`,
      `잔여 한도: ${formatMoney(summary.remaining, 'KRW')}`,
    ]

    if (summary.estimatedTax > 0) {
      lines.push(`예상 증여세: ${formatMoney(summary.estimatedTax, 'KRW')}`)
    }
    if (summary.resetDate) {
      lines.push(`리셋 시점: ${formatDate(summary.resetDate)}`)
    }
    if (summary.firstGiftDate) {
      lines.push(`최초 증여일: ${formatDate(summary.firstGiftDate)}`)
    }

    lines.push('\n※ 참고용이며 법적 조언이 아닙니다.')

    return toolResult(lines.join('\n'))
  } catch (error) {
    return toolError(error)
  }
}

/**
 * get_dividends: 배당금 내역 조회
 */
export async function getDividends(args: {
  account_name: string
  year?: number
}) {
  try {
    const accountId = await resolveAccountId(args.account_name)
    const year = args.year ?? new Date().getFullYear()

    const startDate = new Date(`${year}-01-01`)
    const endDate = new Date(`${year + 1}-01-01`)

    const whereClause = {
      ...(accountId != null ? { accountId } : {}),
      payDate: { gte: startDate, lt: endDate },
    }

    const dividends = await prisma.dividend.findMany({
      where: whereClause,
      orderBy: { payDate: 'desc' },
      include: { account: { select: { name: true } } },
    })

    if (dividends.length === 0) {
      return toolResult(`${year}년 배당금 내역이 없습니다.`)
    }

    const lines = [`## ${args.account_name} ${year}년 배당금 (${dividends.length}건)`]

    let totalNet = 0
    let totalTax = 0
    let hasMissingFxRate = false

    for (const d of dividends) {
      const accountLabel = accountId == null ? `[${d.account.name}] ` : ''
      totalNet += d.amountKRW
      const taxRaw = d.taxAmount ?? 0

      if (d.currency === 'USD') {
        if (d.fxRate == null) hasMissingFxRate = true
        totalTax += Math.round(taxRaw * (d.fxRate ?? DEFAULT_FX_RATE_USD_KRW))
      } else {
        totalTax += Math.round(taxRaw)
      }

      lines.push(
        `- ${formatDate(d.payDate)} ${accountLabel}${d.displayName} (${d.ticker})` +
          ` | 세전 ${formatMoney(d.amountGross, d.currency)}` +
          ` | 세후 ${formatMoney(d.amountNet, d.currency)}` +
          ` | ${formatMoney(d.amountKRW, 'KRW')}`
      )
    }

    lines.push(
      `\n**합계**: 세후 ${formatMoney(totalNet, 'KRW')}` +
        ` | 원천징수 세금 ${formatMoney(totalTax, 'KRW')}`
    )
    if (hasMissingFxRate) {
      lines.push(`※ 환율 누락 건은 기본 환율(${DEFAULT_FX_RATE_USD_KRW.toLocaleString('ko-KR')}원)로 추정`)
    }

    return toolResult(lines.join('\n'))
  } catch (error) {
    return toolError(error)
  }
}
