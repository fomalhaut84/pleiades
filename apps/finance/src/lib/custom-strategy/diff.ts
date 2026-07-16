/**
 * Phase 35-B (#434) — 전략 편집 diff 계산 (pure).
 * 미리보기 UI 가 변경 사항을 하이라이트하기 위한 순수 함수.
 */

import type { Condition, LogicOp, Frequency, ParsedStrategy, WeekdayCode } from './types'
import { conditionToString } from './types'

export interface StrategyDiff {
  nameChanged?: { from: string; to: string }
  logicChanged?: { from: LogicOp; to: LogicOp }
  frequencyChanged?: { from: Frequency; to: Frequency }
  tickerChanged?: { from: string; to: string }
  conditionsAdded: Condition[]
  conditionsRemoved: Condition[]
}

/**
 * Condition 등가 판정용 canonical key.
 * `conditionToString` 을 기본으로 사용하되, evaluator 가 실행 시 무시하거나 정규화하는
 * 필드는 canonical key 도 동일하게 처리해 무변경 편집 false-positive 를 방지.
 *
 * 정규화 대상 (evaluator semantics 대비):
 *   - `weekday.value`: `includes` 로 unordered set 취급 → 정렬 (#440 재재리뷰 P2)
 *   - `cross_ticker.crossTicker`: `trim().toUpperCase()` (#440 재재재리뷰 P2)
 *   - **비-change_pct 조건의 `timeframe`**: change_pct 전용 필드. price/rsi/문자열
 *     타입에 timeframe 이 붙어 와도 evaluator 는 무시 → canonical 에서도 배제
 *     (#440 재재재재리뷰 P2). conditionToString 이 timeframe 을 어느 타입에나 렌더
 *     하는 것이 문제 원인.
 *   - Phase 38-A (#448) — cross_ticker.metric 확장 (rsi/macd_signal/sma_cross/bb_position).
 *     canonical key 는 raw 숫자값을 사용하므로 metric 별 카테고리컬 라벨링 (`GOLDEN`/`DEAD` 등)
 *     이 conditionToString 에서만 렌더되고 diff 판정에는 영향 없음 (evaluator 도 raw 숫자로 비교).
 */
function condKey(c: Condition): string {
  if (c.type === 'weekday' && Array.isArray(c.value)) {
    const sorted = [...(c.value as WeekdayCode[])].sort()
    return `weekday ${c.operator} [${sorted.join(',')}]`
  }
  if (c.type === 'cross_ticker') {
    const t = (c.crossTicker ?? '').trim().toUpperCase()
    return `${t}.${c.metric ?? '?'} ${c.operator} ${c.value}`
  }
  // change_pct 만 timeframe 관여. 그 외 타입은 timeframe 무시.
  if (c.type !== 'change_pct') {
    return `${c.type} ${c.operator} ${c.value}`
  }
  return conditionToString(c)
}

export function computeStrategyDiff(before: ParsedStrategy, after: ParsedStrategy): StrategyDiff {
  const diff: StrategyDiff = { conditionsAdded: [], conditionsRemoved: [] }

  if (before.name !== after.name) {
    diff.nameChanged = { from: before.name, to: after.name }
  }
  if (before.ticker !== after.ticker) {
    diff.tickerChanged = { from: before.ticker, to: after.ticker }
  }
  if (before.logic !== after.logic) {
    diff.logicChanged = { from: before.logic, to: after.logic }
  }
  if (before.frequency !== after.frequency) {
    diff.frequencyChanged = { from: before.frequency, to: after.frequency }
  }

  const beforeKeys = new Map(before.conditions.map((c) => [condKey(c), c]))
  const afterKeys = new Map(after.conditions.map((c) => [condKey(c), c]))

  for (const [k, c] of afterKeys) {
    if (!beforeKeys.has(k)) diff.conditionsAdded.push(c)
  }
  for (const [k, c] of beforeKeys) {
    if (!afterKeys.has(k)) diff.conditionsRemoved.push(c)
  }

  return diff
}

/** diff 가 실제 변경을 포함하는지 (미리보기 UI 에서 "변경 없음" 표시용) */
export function hasDiff(d: StrategyDiff): boolean {
  return !!(
    d.nameChanged || d.logicChanged || d.frequencyChanged || d.tickerChanged ||
    d.conditionsAdded.length > 0 || d.conditionsRemoved.length > 0
  )
}

/**
 * Pure — 두 조건 배열이 의미적으로 동일한지 (순서·필드순 무관) 비교.
 * `conditionToString` 은 fixed key order (`type / operator / value / timeframe`) 로
 * 렌더링하므로 원본 오브젝트의 필드 순서에 관계없이 같은 문자열을 생성.
 *
 * PUT 흐름에서 conditions 무변경 판정에 사용 (Codex #440 재리뷰 P2 — 이전 구현은
 * `JSON.stringify` 로 field-order-sensitive 비교 → 동일 의미인데 필드 순서만 다른
 * 요청도 변경으로 오판 → lastTriggeredAt 오리셋 → `once` 재무장).
 */
export function conditionsEqual(a: Condition[], b: Condition[]): boolean {
  if (a.length !== b.length) return false
  const sa = a.map(condKey).sort()
  const sb = b.map(condKey).sort()
  return sa.every((s, i) => s === sb[i])
}
