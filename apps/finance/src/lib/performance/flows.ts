/**
 * 스냅샷 수량 차분 흐름 (docs/specs/010-fin-cashflow-return.md §4-2 F-s · pleiades#552).
 *
 * 경계는 "보유 종목만" 이다(스냅샷에 현금이 없다) — 매수·매도·vest 가 곧 외부 흐름이다.
 * 흐름을 `Trade` 가 아니라 연속 스냅샷의 수량 차이에서 얻는다: 거래 기록의 날짜(`tradedAt`)는
 * 소급 입력·import·수정·봇 입력 시각 때문에 스냅샷과 맞지 않는다(010 §3-3).
 *
 * - 금액 = ΔN × 원화 단가. 원화 단가 = `valueKRW / shares`(그 스냅샷 환율 포함) — `price` 는 현지 통화라 쓰지 않는다
 * - 양쪽 스냅샷에 보유가 있으면 두 단가의 평균 · 신규 편입·전량 매도처럼 한쪽만 있으면 그쪽 단가(010 §2 정정 블록)
 * - 시점 = 뒤 스냅샷 날짜(그 스냅샷에서 처음 보인다)
 *
 * prisma 를 부르지 않는다 — 순수 함수.
 */

import { sharesDiffer } from './shares'

export interface SnapshotHolding {
  ticker: string
  shares: number
  valueKRW: number
}

export interface SnapshotPoint {
  date: Date
  holdings: readonly SnapshotHolding[]
}

/** 유입(+) = 매수·vest · 유출(−) = 매도 */
export interface Flow {
  ticker: string
  date: Date
  amountKRW: number
}

interface Position {
  shares: number
  valueKRW: number
}

/** 같은 티커 여러 줄은 합친다(contribution.ts 와 같다) */
export function positionsOf(point: SnapshotPoint): ReadonlyMap<string, Position> {
  const map = new Map<string, Position>()
  for (const h of point.holdings) {
    const prev = map.get(h.ticker)
    map.set(h.ticker, {
      shares: (prev?.shares ?? 0) + h.shares,
      valueKRW: (prev?.valueKRW ?? 0) + h.valueKRW,
    })
  }
  return map
}

/** 평가액 0 인 쪽(시세 없어 평단가 대체 · USD `avgPriceFx` 없음)은 단가가 없는 것으로 본다 — 평균을 반으로 깎지 않는다(PR 9-1 major) */
function unitKRW(p: Position | undefined): number | null {
  return p && p.shares > 0 && p.valueKRW > 0 ? p.valueKRW / p.shares : null
}

/** 두 스냅샷 사이 흐름의 원화 단가 — 양쪽이면 평균 · 한쪽이면 그쪽 · 둘 다 없으면 0 */
export function flowUnitKRW(before: Position | undefined, after: Position | undefined): number {
  const a = unitKRW(before)
  const b = unitKRW(after)
  if (a !== null && b !== null) return (a + b) / 2
  return a ?? b ?? 0
}

export function flowsFromSnapshots(points: readonly SnapshotPoint[]): Flow[] {
  const sorted = [...points].sort((x, y) => x.date.getTime() - y.date.getTime())
  const flows: Flow[] = []
  for (let k = 1; k < sorted.length; k++) {
    const before = positionsOf(sorted[k - 1])
    const after = positionsOf(sorted[k])
    const tickers = new Set<string>([...before.keys(), ...after.keys()])
    tickers.forEach((ticker) => {
      const b = before.get(ticker)
      const a = after.get(ticker)
      const n0 = b?.shares ?? 0
      const n1 = a?.shares ?? 0
      if (!sharesDiffer(n0, n1)) return
      flows.push({ ticker, date: sorted[k].date, amountKRW: (n1 - n0) * flowUnitKRW(b, a) })
    })
  }
  return flows
}
