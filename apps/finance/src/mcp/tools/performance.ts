import { calculateTWR } from '@/lib/performance/twr'
import { calculateContribution } from '@/lib/performance/contribution'
import { formatKRW, formatSignedKRW } from '@/lib/format'
import {
  resolveAccountId,
  getAllAccountIds,
  toolResult,
  toolError,
} from '../utils'

// pleiades#554 · 010 Q2 — 기여도는 현금흐름 보정값이다. AI 가 TWR 과 같은 숫자로 읽거나 "—" 를 0 으로 읽지 않게 한 줄 남긴다
export const CONTRIBUTION_NOTE =
  '※ 수익률·기여도·기간 수익률은 현금흐름 보정값이다(Modified Dietz — 기간 중 매수·매도·vest 는 스냅샷 수량 변화로 빼고 세후 배당은 더한다). TWR 과 다를 수 있다. "—" 는 분모가 너무 작아 계산하지 않은 값이다. 주식 분할은 기록 경로가 없어 매매로 보일 수 있다.'

const pct = (v: number | null, digits: number, unit: string) =>
  v === null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(digits)}${unit}`

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
        lines.push(`기간 수익률(현금흐름 보정): ${pct(contribution.totalReturn, 2, '%')}`)
        for (const h of contribution.holdings) {
          const flow = Math.round(h.netFlowKRW) === 0
            ? ''
            : ` | ${h.netFlowKRW > 0 ? '순매수' : '순매도'} ${formatKRW(Math.abs(h.netFlowKRW))}`
          const div = Math.round(h.dividendKRW) === 0 ? '' : ` | 배당 ${formatKRW(h.dividendKRW)}`
          lines.push(
            `- ${h.displayName} (${h.ticker}):` +
              ` 비중 ${h.weightStart.toFixed(1)}%→${h.weightEnd.toFixed(1)}%` +
              ` | 손익 ${formatSignedKRW(h.gainKRW)}` +
              ` | 수익률 ${pct(h.returnPct, 1, '%')}` +
              ` | 기여도 ${pct(h.contribution, 2, '%p')}` +
              flow +
              div
          )
        }
        lines.push(CONTRIBUTION_NOTE)
      }

      results.push(lines.join('\n'))
    }

    return toolResult(results.join('\n\n'))
  } catch (error) {
    return toolError(error)
  }
}
