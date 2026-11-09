/**
 * pleiades#552 — 010 A1-1: 스냅샷 차분 흐름 · Modified Dietz 순수 함수.
 * 정본 docs/specs/010-fin-cashflow-return.md §4-1 · §4-2 F-s · §2(Q3 배당 · Q5 작은 분모).
 */

import { describe, expect, it } from 'vitest'
import { flowsFromSnapshots, flowUnitKRW, type SnapshotPoint } from '../flows'
import { modifiedDietz, type DietzInput } from '../modified-dietz'

const S = new Date('2026-10-01T00:00:00Z')
const day = (n: number) => new Date(S.getTime() + n * 24 * 60 * 60 * 1000)
const E = day(30)
const m = (o: Record<string, number>) => new Map(Object.entries(o))

function run(over: Partial<DietzInput>) {
  return modifiedDietz({ start: S, end: E, startValues: m({}), endValues: m({}), flows: [], dividends: [], ...over })
}
const h = (r: ReturnType<typeof run>, t: string) => r.holdings.find((x) => x.ticker === t)!
const sumC = (r: ReturnType<typeof run>) => r.holdings.reduce((a, x) => a + (x.contributionPct ?? 0), 0)

describe('flowsFromSnapshots', () => {
  const pt = (n: number, hs: [string, number, number][]): SnapshotPoint => ({
    date: day(n),
    holdings: hs.map(([ticker, shares, valueKRW]) => ({ ticker, shares, valueKRW })),
  })

  it('양쪽 보유면 두 원화 단가의 평균 · 시점은 뒤 스냅샷', () => {
    const f = flowsFromSnapshots([pt(0, [['A', 10, 1000]]), pt(1, [['A', 15, 1650]])])
    expect(f).toEqual([{ ticker: 'A', date: day(1), amountKRW: 5 * ((100 + 110) / 2) }])
  })

  it('신규 편입은 뒤 단가 · 전량 매도는 앞 단가(보유 행이 지워진다)', () => {
    const f = flowsFromSnapshots([pt(0, [['OLD', 4, 400]]), pt(1, [['NEW', 2, 300]])])
    expect(f).toContainEqual({ ticker: 'NEW', date: day(1), amountKRW: 2 * 150 })
    expect(f).toContainEqual({ ticker: 'OLD', date: day(1), amountKRW: -4 * 100 })
  })

  it('수량이 같거나 합산 오차뿐이면 흐름 없음 · 같은 티커 여러 줄은 합친다', () => {
    const f = flowsFromSnapshots([
      pt(0, [['A', 0.1, 10], ['A', 0.2, 20]]),
      pt(1, [['A', 0.3, 33]]),
    ])
    expect(f).toEqual([])
  })

  it('끝점 수량이 같아도 중간 매매(10→4→10)를 잡는다 · 입력 순서와 무관', () => {
    const f = flowsFromSnapshots([pt(2, [['A', 10, 1000]]), pt(0, [['A', 10, 1000]]), pt(1, [['A', 4, 400]])])
    expect(f.map((x) => x.amountKRW)).toEqual([-600, 600])
  })

  it('원화 단가는 valueKRW/shares — 현지 통화 가격(price)을 쓰지 않는다(USD 환율 포함)', () => {
    // USD 종목: 1주 $100 · 환율 1400 → valueKRW 140000/주
    expect(flowUnitKRW({ shares: 2, valueKRW: 280000 }, { shares: 3, valueKRW: 420000 })).toBe(140000)
    expect(flowUnitKRW(undefined, undefined)).toBe(0)
  })
})

describe('modifiedDietz', () => {
  it('흐름이 없으면 단순 수익률과 같다 · 기여도 합 = R', () => {
    const r = run({ startValues: m({ A: 600, B: 400 }), endValues: m({ A: 700, B: 400 }) })
    expect(r.returnPct).toBeCloseTo(10)
    expect(h(r, 'A').contributionPct).toBeCloseTo(10)
    expect(h(r, 'A').returnPct).toBeCloseTo(100 / 6)
    expect(sumC(r)).toBeCloseTo(r.returnPct!)
  })

  it('기간 중 매수는 수익이 아니다 — 매수 금액을 빼고 가중 분모에 넣는다', () => {
    const r = run({
      startValues: m({ A: 1000 }),
      endValues: m({ A: 1600 }),
      flows: [{ ticker: 'A', date: day(10), amountKRW: 500 }],
    })
    expect(h(r, 'A').gainKRW).toBeCloseTo(100)
    expect(r.denominatorKRW).toBeCloseTo(1000 + (20 / 30) * 500)
    expect(r.returnPct).toBeCloseTo(7.5)
  })

  it('vest(+5주 · 가격 그대로)는 손익 0 — 지금 계산은 +50% 로 보였다', () => {
    const f = flowsFromSnapshots([
      { date: S, holdings: [{ ticker: 'R', shares: 10, valueKRW: 1000 }] },
      { date: E, holdings: [{ ticker: 'R', shares: 15, valueKRW: 1500 }] },
    ])
    const r = run({ startValues: m({ R: 1000 }), endValues: m({ R: 1500 }), flows: f })
    expect(h(r, 'R').gainKRW).toBeCloseTo(0)
    expect(r.returnPct).toBeCloseTo(0)
  })

  it('전량 매도한 종목도 손익이 남는다(끝 스냅샷에 없어도) · 합 = R', () => {
    const r = run({
      startValues: m({ A: 500, B: 500 }),
      endValues: m({ A: 500 }),
      flows: [{ ticker: 'B', date: day(15), amountKRW: -550 }],
    })
    expect(h(r, 'B').gainKRW).toBeCloseTo(50)
    expect(r.denominatorKRW).toBeCloseTo(1000 - 0.5 * 550)
    expect(sumC(r)).toBeCloseTo(r.returnPct!)
  })

  it('배당은 세후 원화를 수익에 더한다 — 매도 뒤 지급돼 스냅샷에 없는 종목도 · 합 = R', () => {
    const r = run({
      startValues: m({ A: 1000 }),
      endValues: m({ A: 1000 }),
      dividends: [{ ticker: 'GONE', date: day(15), amountKRW: 30 }],
    })
    expect(h(r, 'GONE').gainKRW).toBe(30)
    expect(r.denominatorKRW).toBeCloseTo(1000 - 0.5 * 30)
    expect(r.returnPct).toBeCloseTo((30 / 985) * 100)
    expect(sumC(r)).toBeCloseTo(r.returnPct!)
  })

  it('배당 지급일은 [S, E) — 시작일은 넣고 종료일은 뺀다(이어지는 기간에 두 번 들어가지 않는다)', () => {
    const r = run({
      startValues: m({ A: 1000 }),
      endValues: m({ A: 1000 }),
      dividends: [
        { ticker: 'A', date: S, amountKRW: 10 },
        { ticker: 'A', date: E, amountKRW: 99 },
      ],
    })
    expect(h(r, 'A').dividendKRW).toBe(10)
  })

  it('기간 초 대량 매도로 계좌 분모가 시작 평가액의 10% 미만이면 R·기여도 null(Q5)', () => {
    const r = run({
      startValues: m({ A: 1000 }),
      endValues: m({ A: 15 }),
      flows: [{ ticker: 'A', date: day(1), amountKRW: -990 }],
    })
    expect(r.denominatorKRW).toBeLessThan(100)
    expect(r.returnPct).toBeNull()
    expect(h(r, 'A').contributionPct).toBeNull()
  })

  it('기간 끝에 처음 산 종목은 r_i 만 null · 기여도는 계좌 분모라 낸다(Q5)', () => {
    const r = run({
      startValues: m({ A: 1000 }),
      endValues: m({ A: 1000, NEW: 1010 }),
      flows: [{ ticker: 'NEW', date: E, amountKRW: 1000 }],
    })
    expect(h(r, 'NEW').returnPct).toBeNull()
    expect(h(r, 'NEW').contributionPct).toBeCloseTo(1)
    expect(h(r, 'A').returnPct).toBeCloseTo(0)
  })

  it('기간 0 이면 전부 null', () => {
    const r = modifiedDietz({ start: S, end: S, startValues: m({ A: 1 }), endValues: m({ A: 2 }), flows: [], dividends: [] })
    expect(r.returnPct).toBeNull()
    expect(h(r, 'A').returnPct).toBeNull()
  })

  it('기간 밖 흐름(시작 시점 이하 · 종료 뒤)은 넣지 않는다', () => {
    const r = run({
      startValues: m({ A: 1000 }),
      endValues: m({ A: 1000 }),
      flows: [
        { ticker: 'A', date: S, amountKRW: 777 },
        { ticker: 'A', date: day(31), amountKRW: 777 },
      ],
    })
    expect(h(r, 'A').flowKRW).toBe(0)
  })
})
