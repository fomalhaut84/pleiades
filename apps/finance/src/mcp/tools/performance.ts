import { calculateTWR } from '@/lib/performance/twr'
import { calculateContribution } from '@/lib/performance/contribution'
import {
  resolveAccountId,
  getAllAccountIds,
  toolResult,
  toolError,
} from '../utils'

// pleiades#262 B — 기여도는 기간 안의 매수·매도를 빼지 않는다. AI 가 수량 변동분을 손실·이익으로 읽지 않게 표시한다
export const SHARES_CHANGED_MARK = '⚠'
export const SHARES_CHANGED_NOTE =
  `※ ${SHARES_CHANGED_MARK} 종목은 기간 중 수량이 바뀌었다 — 수익률·기여도가 매수·매도 금액이 섞인 평가액 변화라 실제 손익이 아니다.`

/** 소수 주(해외)는 4자리까지 · 정수면 소수점 없이 */
function formatShares(shares: number): string {
  return String(Number(shares.toFixed(4)))
}

/**
 * get_performance: TWR 수익률 + 종목별 기여도 분석
 */
export async function getPerformance(args: {
  account_name: string
  period?: string
}) {
  try {
    const period = args.period ?? '1M'

    const accountId = await resolveAccountId(args.account_name)
    const accounts =
      accountId != null
        ? [{ id: accountId, name: args.account_name }]
        : await getAllAccountIds()

    const results: string[] = []

    const accountResults = await Promise.all(
      accounts.map(async (account) => {
        const [twr, contribution] = await Promise.all([
          calculateTWR(account.id, period),
          calculateContribution(account.id, period),
        ])
        return { account, twr, contribution }
      })
    )

    for (const { account, twr, contribution } of accountResults) {

      const lines = [`## ${account.name} (${period})`]

      // TWR 수익률
      if (twr.twr != null) {
        lines.push(`TWR 수익률: ${twr.twr >= 0 ? '+' : ''}${twr.twr.toFixed(2)}%`)
        if (twr.benchmarkReturn != null && twr.benchmarkTicker) {
          lines.push(
            `벤치마크 (${twr.benchmarkTicker}): ${twr.benchmarkReturn >= 0 ? '+' : ''}${twr.benchmarkReturn.toFixed(2)}%`
          )
          if (twr.alpha != null) {
            lines.push(`알파: ${twr.alpha >= 0 ? '+' : ''}${twr.alpha.toFixed(2)}%p`)
          }
        }
        lines.push(`스냅샷 수: ${twr.snapshotCount}`)
      } else {
        lines.push('TWR 계산 불가 (스냅샷 부족)')
      }

      // 종목별 기여도
      if (contribution.hasData && contribution.holdings.length > 0) {
        lines.push(`\n### 종목별 기여도`)
        lines.push(
          `전체 수익률: ${contribution.totalReturn >= 0 ? '+' : ''}${contribution.totalReturn.toFixed(2)}%`
        )
        for (const h of contribution.holdings) {
          lines.push(
            `- ${h.displayName} (${h.ticker}):` +
              ` 비중 ${h.weightStart.toFixed(1)}%→${h.weightEnd.toFixed(1)}%` +
              ` | 수익률 ${h.returnPct >= 0 ? '+' : ''}${h.returnPct.toFixed(1)}%` +
              ` | 기여도 ${h.contribution >= 0 ? '+' : ''}${h.contribution.toFixed(2)}%p` +
              (h.sharesChanged
                ? ` | ${SHARES_CHANGED_MARK} 수량 변동 ${formatShares(h.sharesStart)}→${formatShares(h.sharesEnd)}주`
                : '')
          )
        }
        if (contribution.holdings.some((h) => h.sharesChanged)) {
          lines.push(SHARES_CHANGED_NOTE)
        }
      }

      results.push(lines.join('\n'))
    }

    return toolResult(results.join('\n\n'))
  } catch (error) {
    return toolError(error)
  }
}
