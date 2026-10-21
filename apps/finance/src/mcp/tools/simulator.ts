import { prisma } from '@/lib/prisma'
import {
  simulateAccount,
  DEFAULT_SCENARIOS,
} from '@/lib/simulator/compound-engine'
import { calcCostKRW, calcCurrentValueKRW, DEFAULT_FX_RATE_USD_KRW } from '@/lib/format'
import { calcGiftTaxSummary } from '@/lib/tax/gift-tax'
import {
  resolveAccountId,
  toolResult,
  toolError,
  formatMoney,
} from '../utils'

/**
 * simulate_growth: 복리 성장 시뮬레이션
 */
export async function simulateGrowth(args: {
  account_name: string
  years?: number
  monthly?: number
  return_pct?: number
}) {
  try {
    const accountId = await resolveAccountId(args.account_name)
    if (accountId == null) {
      return toolError('시뮬레이션은 개별 계좌만 지원합니다.')
    }

    const account = await prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { name: true, ownerAge: true },
    })

    // 현재 평가금 계산
    const holdings = await prisma.holding.findMany({
      where: { accountId },
    })

    const fxCache = await prisma.priceCache.findUnique({
      where: { ticker: 'USDKRW=X' },
    })
    const fxRate = fxCache?.price ?? DEFAULT_FX_RATE_USD_KRW

    const tickers = holdings.map((h) => h.ticker)
    const prices = await prisma.priceCache.findMany({
      where: { ticker: { in: tickers } },
    })
    const priceMap = new Map(prices.map((p) => [p.ticker, p.price]))

    let initialValue = 0
    for (const h of holdings) {
      const currentPrice = priceMap.get(h.ticker)
      if (currentPrice == null) {
        // 시세 없으면 매입금 기준
        initialValue += calcCostKRW(h)
        continue
      }
      const currentFxRate = h.currency === 'USD' ? fxRate : 1
      initialValue += calcCurrentValueKRW(h, currentPrice, currentFxRate)
    }

    // 증여 누적액 (미성년 계좌, 10년 윈도우 기준)
    let giftTotal = 0
    if (account.ownerAge != null && account.ownerAge < 19) {
      const deposits = await prisma.deposit.findMany({
        where: { accountId },
        select: { amount: true, source: true, depositedAt: true },
      })
      const summary = calcGiftTaxSummary(deposits, true)
      giftTotal = summary.totalGifted
    }

    const years = args.years ?? 10
    const monthly = args.monthly ?? 0

    // 커스텀 수익률이 있으면 단일 시나리오, 없으면 기본 3시나리오
    const scenarios =
      args.return_pct != null
        ? [{ name: `${args.return_pct}%`, rate: args.return_pct / 100 }]
        : DEFAULT_SCENARIOS

    const result = simulateAccount({
      accountId,
      accountName: account.name,
      initialValue,
      monthlyContribution: monthly,
      years,
      ownerAge: account.ownerAge,
      giftTotal,
      scenarios,
    })

    const lines = [
      `## ${account.name} 성장 시뮬레이션`,
      `현재 평가금: ${formatMoney(initialValue, 'KRW')}`,
      `월 적립금: ${formatMoney(monthly, 'KRW')}`,
      `기간: ${years}년`,
    ]

    for (const scenario of result.scenarios) {
      lines.push(
        `\n### ${scenario.scenarioName} (연 ${(scenario.annualReturn * 100).toFixed(1)}%)`,
        `최종 자산: ${formatMoney(scenario.finalValue, 'KRW')}`,
        `총 투입금: ${formatMoney(scenario.totalContributed, 'KRW')}`,
        `총 수익: ${formatMoney(scenario.totalGrowth, 'KRW')}`
      )
    }

    if (result.milestones.length > 0) {
      lines.push('\n### 마일스톤')
      for (const m of result.milestones) {
        const yearMark = (m.month / 12).toFixed(1)
        lines.push(
          `- ${m.label} (${yearMark}년 후): ${formatMoney(m.estimatedValue, 'KRW')}`
        )
      }
    }

    if (result.giftLimitMonth != null) {
      if (result.giftLimitMonth === 0) {
        lines.push('\n⚠ 증여세 비과세 한도 이미 초과')
      } else {
        lines.push(
          `\n증여세 비과세 한도 도달 예상: 약 ${result.giftLimitMonth}개월 후`
        )
      }
    }

    lines.push('\n※ 참고용이며 실제 수익률과 다를 수 있습니다.')

    return toolResult(lines.join('\n'))
  } catch (error) {
    return toolError(error)
  }
}
