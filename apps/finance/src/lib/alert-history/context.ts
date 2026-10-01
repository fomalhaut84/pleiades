/**
 * Phase 37-A (#444) — AlertHistory.contextJson 스키마 + 순수 빌더.
 *
 * 알림 발동 hook 이 이미 확보한 데이터 (priceCache row, TAReport, evaluator 결과 등) 를
 * 재활용해 최소 스냅샷을 만든다. 추가 fetch 를 유발하지 않는다.
 *
 * kind 별 payload shape:
 *   surge | drop | target_hit | stop_loss | watch_buy | watch_zone
 *     → { price, prevPrice?, changePercent?, marketOpen? }
 *   fx  → { rate, prevRate?, changePercent? }
 *   ta_signal → { rsi?, macdCrossover?, bbPosition?, price?, changePercent?, signals[] }
 *   custom_strategy → { strategyId, strategyName, logic, conditions[], perCondition[], snapshot? }
 *
 * `type` 필드가 kind discriminator 역할. 사후 진단 UI 는 이 필드로 렌더러 분기.
 */

import type { Condition } from '@/lib/custom-strategy/types'
import type { TAReport, BBPosition, MACDCrossover } from '@/lib/ta/types'

/** 상세 모달의 kind discriminator. AlertKind 와 값 동일 (`kind` 컬럼과 정합). */
export type AlertContextKind =
  | 'surge' | 'drop'
  | 'target_hit' | 'stop_loss'
  | 'watch_buy' | 'watch_zone'
  | 'fx'
  | 'ta_signal'
  | 'custom_strategy'

/**
 * Phase 37-B (#445) — 모든 context shape 공용 옵셔널 필드.
 * `retriedFrom`: 재발송으로 생성된 새 row 는 원본 AlertHistory.id 를 저장.
 * 원본 row 는 이 필드가 없어 재발송 이력과 원본이 구분됨.
 */
interface CommonContextFields {
  /** 재발송된 경우 원본 AlertHistory.id — UI 가 "재발송" 배지를 표시 */
  retriedFrom?: string
}

/** 시세 계열 (surge/drop/target_hit/stop_loss/watch_buy/watch_zone) 공통 스냅샷 */
export interface PriceAlertContext extends CommonContextFields {
  type: 'surge' | 'drop' | 'target_hit' | 'stop_loss' | 'watch_buy' | 'watch_zone'
  price: number
  changePercent: number | null
  /** 목표가/손절가/구간 등 조건 값 (kind 별 의미 다름). 없으면 null */
  threshold?: number | null
  /** 시장 개장 여부 — 사후 진단 시 "장중이었나?" 즉시 확인 */
  marketOpen: boolean | null
}

/** 환율 알림 컨텍스트 */
export interface FxAlertContext extends CommonContextFields {
  type: 'fx'
  rate: number
  /** 전일 대비 KRW 변동 */
  changeKrw: number | null
  changePercent: number | null
}

/** TA 시그널 컨텍스트 — TAReport 에서 핵심 지표만 발췌 */
export interface TaSignalContext extends CommonContextFields {
  type: 'ta_signal'
  price: number | null
  changePercent: number | null
  rsi: number | null
  macdCrossover: MACDCrossover | null
  bbPosition: BBPosition | null
  smaGoldenCross: boolean | null
  smaDeathCross: boolean | null
  volumeSurge: boolean | null
  /** 발동된 시그널 id 목록 (예: ['RSI_OVERSOLD', 'MACD_GOLDEN']) */
  signals: string[]
  /** 종합 시그널 등급 */
  overall: string | null
}

/** 커스텀 전략 컨텍스트 — evaluator 결과 재활용 */
export interface CustomStrategyContext extends CommonContextFields {
  type: 'custom_strategy'
  strategyId: string
  strategyName: string
  strategyTicker: string
  logic: 'AND' | 'OR'
  conditions: Condition[]
  /** 각 조건 만족 여부. evaluator 의 perCondition 을 그대로 저장 */
  perCondition: Array<{ condition: Condition; result: boolean }>
  /** 스냅샷 요약 — TA 리포트 fetch 를 안 하는 경우 (price only) 대비 옵셔널 */
  snapshot?: {
    price: number | null
    changePercent: number | null
    rsi?: number | null
    macdCrossover?: MACDCrossover | null
    bbPosition?: BBPosition | null
  }
}

export type AlertHistoryContext =
  | PriceAlertContext
  | FxAlertContext
  | TaSignalContext
  | CustomStrategyContext

// ─── 빌더 pure 함수들 ──────────────────────────────────────────────

/**
 * 시세 계열 (surge/drop/target_hit/stop_loss/watch_buy/watch_zone) 컨텍스트 빌더.
 * `prevPrice` 는 PriceCache 에 없어 옵셔널 — changePercent 로 회귀 계산 가능.
 */
export function buildPriceContext(input: {
  type: PriceAlertContext['type']
  price: number
  changePercent: number | null
  threshold?: number | null
  marketOpen: boolean | null
}): PriceAlertContext {
  return {
    type: input.type,
    price: input.price,
    changePercent: input.changePercent,
    threshold: input.threshold ?? null,
    marketOpen: input.marketOpen,
  }
}

/** 환율 컨텍스트 빌더 */
export function buildFxContext(input: {
  rate: number
  changeKrw: number | null
  changePercent: number | null
}): FxAlertContext {
  return {
    type: 'fx',
    rate: input.rate,
    changeKrw: input.changeKrw,
    changePercent: input.changePercent,
  }
}

/**
 * TA 시그널 컨텍스트 빌더. TAReport 가 필수 (checkSignals 는 report 를 기반으로 판정).
 * TAReport 는 이미 fetch 된 상태 → 추가 비용 없음.
 */
export function buildTaContext(input: {
  report: TAReport
  price: number | null
  changePercent: number | null
  signals: string[]
}): TaSignalContext {
  const { indicators, signalSummary } = input.report
  return {
    type: 'ta_signal',
    price: input.price,
    changePercent: input.changePercent,
    rsi: Number.isFinite(indicators.rsi14.value) ? indicators.rsi14.value : null,
    macdCrossover: indicators.macd.crossover ?? null,
    bbPosition: indicators.bollingerBands.position ?? null,
    smaGoldenCross: indicators.sma.goldenCross ?? null,
    smaDeathCross: indicators.sma.deathCross ?? null,
    volumeSurge: indicators.volume.surge ?? null,
    signals: [...input.signals],
    overall: signalSummary.overall ?? null,
  }
}

/**
 * 커스텀 전략 컨텍스트 빌더. evaluator 의 perCondition 을 그대로 보존해
 * 사후 진단 시 어느 조건이 만족/미달이었는지 재현.
 * conditions 는 저장 시점 스냅샷 (편집 후에도 발동 당시 상태 유지).
 */
export function buildCustomStrategyContext(input: {
  strategyId: string
  strategyName: string
  strategyTicker: string
  logic: 'AND' | 'OR'
  conditions: Condition[]
  perCondition: Array<{ condition: Condition; result: boolean }>
  snapshot?: CustomStrategyContext['snapshot']
}): CustomStrategyContext {
  return {
    type: 'custom_strategy',
    strategyId: input.strategyId,
    strategyName: input.strategyName,
    strategyTicker: input.strategyTicker,
    logic: input.logic,
    // 깊은 복사 대신 얕은 복사 — Condition 은 primitive 필드 위주.
    conditions: input.conditions.map((c) => ({ ...c })),
    perCondition: input.perCondition.map((p) => ({
      condition: { ...p.condition },
      result: p.result,
    })),
    snapshot: input.snapshot,
  }
}

/**
 * 저장 전 sanity check — 알 수 없는 shape 이 저장되지 않도록.
 * DB 는 Json? 이라 어떤 값도 통과되지만, evaluator 결과가 예상 밖일 때 저장 방지 목적.
 */
export function isValidContext(v: unknown): v is AlertHistoryContext {
  if (!v || typeof v !== 'object') return false
  const t = (v as { type?: unknown }).type
  return (
    t === 'surge' || t === 'drop' ||
    t === 'target_hit' || t === 'stop_loss' ||
    t === 'watch_buy' || t === 'watch_zone' ||
    t === 'fx' || t === 'ta_signal' || t === 'custom_strategy'
  )
}
