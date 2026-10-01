/**
 * 스톡옵션 계산 유틸리티
 *
 * 내가치(intrinsic value) = max(0, 현재가 - 행사가) × 잔여수량
 * 행사 이익 = (행사시 시가 - 행사가) × 행사수량
 * 행사 시 근로소득으로 과세 (누진세율 적용)
 */

import { calcIncomeTax } from '@/lib/tax/income-tax'

export interface StockOptionWithVestings {
  id: string
  ticker: string
  displayName: string
  grantDate: string
  expiryDate: string
  strikePrice: number
  totalShares: number
  cancelledShares: number
  exercisedShares: number
  adjustedShares: number
  remainingShares: number
  vestings: {
    id: string
    vestingDate: string
    shares: number
    status: string
  }[]
}

export interface StockOptionSummary {
  /** 부여 ID */
  id: string
  displayName: string
  grantDate: string
  expiryDate: string
  strikePrice: number
  remainingShares: number
  /** 행사 가능 수량 (exercisable 상태) */
  exercisableShares: number
  /** 대기 수량 (pending 상태) */
  pendingShares: number
  /** 내가치 (현재가 기준, 전체 잔여) */
  intrinsicValue: number
  /** 행사 가능분 내가치 */
  exercisableValue: number
  /** 1주당 내가치 */
  perShareValue: number
  /** 현재가 > 행사가 여부 */
  inTheMoney: boolean
  /** 만료까지 남은 일수 */
  daysToExpiry: number
  /** 베스팅 상세 */
  vestings: {
    id: string
    vestingDate: string
    shares: number
    status: string
    intrinsicValue: number
  }[]
}

export interface StockOptionOverview {
  /** 개별 옵션 요약 */
  options: StockOptionSummary[]
  /** 전체 내가치 합계 */
  totalIntrinsicValue: number
  /** 행사 가능분 내가치 합계 */
  totalExercisableValue: number
  /** 전체 잔여 주수 */
  totalRemainingShares: number
  /** 행사 가능 주수 */
  totalExercisableShares: number
}

/** 날짜를 YYYY-MM-DD 기준 자정(UTC)으로 정규화 */
function startOfDayUTC(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

/**
 * 스톡옵션 현황 요약 계산 (만료된 부여는 내가치 0 처리)
 */
export function calcStockOptionOverview(
  stockOptions: StockOptionWithVestings[],
  currentPrice: number,
  referenceDate?: Date
): StockOptionOverview {
  const now = referenceDate ?? new Date()
  const todayStart = startOfDayUTC(now)

  const options: StockOptionSummary[] = stockOptions.map((so) => {
    const safeRemaining = Math.max(0, so.remainingShares)
    const expiryStart = startOfDayUTC(new Date(so.expiryDate))
    const daysToExpiry = Math.max(0, Math.ceil((expiryStart - todayStart) / (1000 * 60 * 60 * 24)))
    const expired = expiryStart < todayStart

    const perShareValue = expired ? 0 : Math.max(0, currentPrice - so.strikePrice)
    const inTheMoney = !expired && currentPrice > so.strikePrice

    const activeStatuses = ['pending', 'exercisable']
    const vestingSummaries = so.vestings.map((v) => ({
      ...v,
      intrinsicValue: inTheMoney && activeStatuses.includes(v.status)
        ? perShareValue * Math.max(0, v.shares)
        : 0,
    }))

    const exercisableShares = Math.min(
      so.vestings
        .filter((v) => v.status === 'exercisable')
        .reduce((s, v) => s + Math.max(0, v.shares), 0),
      safeRemaining,
    )

    const pendingShares = so.vestings
      .filter((v) => v.status === 'pending')
      .reduce((s, v) => s + Math.max(0, v.shares), 0)

    return {
      id: so.id,
      displayName: so.displayName,
      grantDate: so.grantDate,
      expiryDate: so.expiryDate,
      strikePrice: so.strikePrice,
      remainingShares: safeRemaining,
      exercisableShares,
      pendingShares,
      intrinsicValue: perShareValue * safeRemaining,
      exercisableValue: perShareValue * exercisableShares,
      perShareValue,
      inTheMoney,
      daysToExpiry,
      vestings: vestingSummaries,
    }
  })

  return {
    options,
    totalIntrinsicValue: options.reduce((s, o) => s + o.intrinsicValue, 0),
    totalExercisableValue: options.reduce((s, o) => s + o.exercisableValue, 0),
    totalRemainingShares: options.reduce((s, o) => s + o.remainingShares, 0),
    totalExercisableShares: options.reduce((s, o) => s + o.exercisableShares, 0),
  }
}

export interface ExerciseSimulationResult {
  /** 행사 이익 합계 */
  totalGain: number
  /** 부여별 행사 이익 */
  gains: {
    id: string
    displayName: string
    strikePrice: number
    shares: number
    gain: number
    inTheMoney: boolean
  }[]
}

/**
 * 목표 주가로 행사 시뮬레이션 (행사 가능분만)
 */
export function simulateExercise(
  stockOptions: StockOptionWithVestings[],
  targetPrice: number,
  referenceDate?: Date
): ExerciseSimulationResult {
  const now = referenceDate ?? new Date()
  const todayStart = startOfDayUTC(now)

  const gains = stockOptions
    .filter((so) => startOfDayUTC(new Date(so.expiryDate)) >= todayStart)
    .map((so) => {
    const safeRemaining = Math.max(0, so.remainingShares)
    const exercisableShares = Math.min(
      so.vestings
        .filter((v) => v.status === 'exercisable')
        .reduce((s, v) => s + Math.max(0, v.shares), 0),
      safeRemaining,
    )

    const perShareGain = Math.max(0, targetPrice - so.strikePrice)

    return {
      id: so.id,
      displayName: so.displayName,
      strikePrice: so.strikePrice,
      shares: exercisableShares,
      gain: perShareGain * exercisableShares,
      inTheMoney: targetPrice > so.strikePrice,
    }
  }).filter((g) => g.shares > 0)

  return {
    totalGain: gains.reduce((s, g) => s + g.gain, 0),
    gains,
  }
}

export interface ExerciseTaxEstimate {
  /** 행사 이익 (근로소득) */
  exerciseGain: number
  /** 소득세 */
  incomeTax: number
  /** 지방소득세 */
  localTax: number
  /** 총 세금 */
  totalTax: number
}

/**
 * 행사 이익에 대한 근로소득세 추정 (행사 이익만 기준, 기존 연봉 미합산)
 * Phase 5-D에서 연봉 합산 정확 계산으로 대체 예정
 */
export function calcIncomeTaxOnExercise(exerciseGain: number): ExerciseTaxEstimate {
  const safeGain = Number.isFinite(exerciseGain) && exerciseGain > 0 ? exerciseGain : 0
  const incomeTax = calcIncomeTax(safeGain)
  const localTax = Math.round(incomeTax * 0.10)

  return {
    exerciseGain: safeGain,
    incomeTax,
    localTax,
    totalTax: incomeTax + localTax,
  }
}
