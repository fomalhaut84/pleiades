/**
 * Modified Dietz — 보유 경계 (docs/specs/010-fin-cashflow-return.md §4-1 · pleiades#552).
 *
 * 기간 [S, E] · T = E − S · 흐름 시점 t 의 가중치 w_t = (E − t) / T · 흐름 CF(유입 +).
 * - 종목 손익 G_i = V_end_i − V_start_i − CF_i + 배당_i
 * - 계좌 분모 D = V_start + Σ w_t · CF_t − Σ w_t · 배당_t   (배당 = 유출)
 * - 기여도 c_i = G_i / D · 기간 수익률 R = Σ c_i — 종목 집합이 스냅샷·흐름·배당 티커의 합집합이라 합이 맞는다
 * - 종목 수익률 r_i = G_i / (V_start_i + Σ w_t · CF_i,t − Σ w_t · 배당_i,t)
 *
 * R 은 TWR 이 아니다(010 §4-1). 작은 분모는 null("—")로 낸다(010 Q5):
 * D ≤ 0 이거나 D < V_start × MIN_ACCOUNT_DENOMINATOR_RATIO 면 R·c_i 가 null ·
 * 종목 분모 ≤ 0 이거나 < D × MIN_HOLDING_DENOMINATOR_RATIO 면 r_i 만 null.
 *
 * 배당은 지급일이 [S, E) 일 때 넣는다 — 반열린 구간이라 이어지는 두 기간에 두 번 들어가지 않는다(010 §2 정정 블록).
 * 흐름(스냅샷 차분)은 시점이 뒤 스냅샷이라 (S, E] 에 있다.
 *
 * **계약: `start`·`end` 는 `startValues`·`endValues` 를 뽑은 스냅샷의 날짜다.** 기간 경계("지금 − 1Y")를 주면
 * 그 사이 첫 스냅샷 직전의 흐름이 이미 V_start 에 든 매수를 한 번 더 뺀다 — 호출자는 `modifiedDietzFromSnapshots` 를 쓴다.
 *
 * prisma 를 부르지 않는다 — 순수 함수.
 */

import { flowsFromSnapshots, positionsOf, type Flow, type SnapshotPoint } from './flows'

export const MIN_ACCOUNT_DENOMINATOR_RATIO = 0.1
export const MIN_HOLDING_DENOMINATOR_RATIO = 0.01

export interface DividendFlow {
  ticker: string
  date: Date      // payDate
  amountKRW: number // 세후 원화(Dividend.amountKRW)
}

export interface DietzInput {
  start: Date // = 시작 스냅샷 날짜(위 계약)
  end: Date   // = 종료 스냅샷 날짜
  startValues: ReadonlyMap<string, number> // 시작 스냅샷 종목별 valueKRW
  endValues: ReadonlyMap<string, number>   // 종료 스냅샷 종목별 valueKRW
  flows: readonly Flow[]
  dividends: readonly DividendFlow[]
}

export interface HoldingDietz {
  ticker: string
  startKRW: number
  endKRW: number
  flowKRW: number       // 기간 순유입(매수 − 매도)
  dividendKRW: number
  gainKRW: number       // G_i
  returnPct: number | null       // r_i (%)
  contributionPct: number | null // c_i (%)
}

export interface DietzResult {
  periodDays: number
  denominatorKRW: number
  returnPct: number | null // R (%)
  holdings: HoldingDietz[]
}

interface Acc {
  startKRW: number
  endKRW: number
  flowKRW: number
  dividendKRW: number
  weighted: number // Σ w·CF − Σ w·배당
}

const DAY_MS = 24 * 60 * 60 * 1000

export function modifiedDietz(input: DietzInput): DietzResult {
  const s = input.start.getTime()
  const e = input.end.getTime()
  const span = e - s
  const periodDays = span / DAY_MS
  const weight = (t: number) => Math.min(1, Math.max(0, (e - t) / span))

  const acc = new Map<string, Acc>()
  const of = (ticker: string): Acc => {
    const cur = acc.get(ticker) ?? { startKRW: 0, endKRW: 0, flowKRW: 0, dividendKRW: 0, weighted: 0 }
    acc.set(ticker, cur)
    return cur
  }
  // 아래 누적은 함수 안에서 만든 Acc 만 바꾼다 — 입력은 읽기만 한다
  input.startValues.forEach((v, t) => { of(t).startKRW += v })
  input.endValues.forEach((v, t) => { of(t).endKRW += v })

  if (span > 0) {
    for (const f of input.flows) {
      const t = f.date.getTime()
      if (t <= s || t > e) continue
      const a = of(f.ticker)
      a.flowKRW += f.amountKRW
      a.weighted += weight(t) * f.amountKRW
    }
    for (const d of input.dividends) {
      const t = d.date.getTime()
      if (t < s || t >= e) continue
      const a = of(d.ticker)
      a.dividendKRW += d.amountKRW
      a.weighted -= weight(t) * d.amountKRW
    }
  }

  let startTotal = 0
  let weightedTotal = 0
  acc.forEach((a) => {
    startTotal += a.startKRW
    weightedTotal += a.weighted
  })
  const denominatorKRW = startTotal + weightedTotal
  const accountOk =
    span > 0 && denominatorKRW > 0 && denominatorKRW >= startTotal * MIN_ACCOUNT_DENOMINATOR_RATIO

  let gainTotal = 0
  const holdings: HoldingDietz[] = []
  acc.forEach((a, ticker) => {
    const gainKRW = a.endKRW - a.startKRW - a.flowKRW + a.dividendKRW
    gainTotal += gainKRW
    const own = a.startKRW + a.weighted
    const ownOk = span > 0 && own > 0 && (denominatorKRW <= 0 || own >= denominatorKRW * MIN_HOLDING_DENOMINATOR_RATIO)
    holdings.push({
      ticker,
      startKRW: a.startKRW,
      endKRW: a.endKRW,
      flowKRW: a.flowKRW,
      dividendKRW: a.dividendKRW,
      gainKRW,
      returnPct: ownOk ? (gainKRW / own) * 100 : null,
      contributionPct: accountOk ? (gainKRW / denominatorKRW) * 100 : null,
    })
  })

  return {
    periodDays,
    denominatorKRW,
    returnPct: accountOk ? (gainTotal / denominatorKRW) * 100 : null,
    holdings,
  }
}

const valuesOf = (point: SnapshotPoint): ReadonlyMap<string, number> =>
  new Map(Array.from(positionsOf(point), ([ticker, p]) => [ticker, p.valueKRW]))

/**
 * 기간 안 스냅샷 전체(날짜 무관 순서)에서 시작·끝·흐름을 함께 뽑는다 — 위 계약을 호출자가 어길 수 없다.
 * 스냅샷이 2개 미만이면 null.
 */
export function modifiedDietzFromSnapshots(
  points: readonly SnapshotPoint[],
  dividends: readonly DividendFlow[]
): DietzResult | null {
  if (points.length < 2) return null
  const sorted = [...points].sort((x, y) => x.date.getTime() - y.date.getTime())
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  return modifiedDietz({
    start: first.date,
    end: last.date,
    startValues: valuesOf(first),
    endValues: valuesOf(last),
    flows: flowsFromSnapshots(sorted),
    dividends,
  })
}
