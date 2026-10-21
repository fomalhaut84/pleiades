/**
 * 복리 성장 시뮬레이션 엔진
 *
 * 계좌별 현재 자산 + 월 적립금 + RSU 유입 → 미래 자산 예측
 * 3가지 시나리오 (낙관/기본/비관) 동시 계산
 */

export interface SimulationInput {
  /** 시작 자산 (원) */
  initialValue: number
  /** 월 적립금 (원) */
  monthlyContribution: number
  /** 시뮬레이션 기간 (년) */
  years: number
  /** 연 수익률 (0.08 = 8%) */
  annualReturn: number
  /** RSU/스톡옵션 등 일시 유입 이벤트 */
  events?: SimulationEvent[]
}

export interface SimulationEvent {
  /** 시작일로부터 경과 월 */
  monthOffset: number
  /** 유입 금액 (원) */
  amount: number
  /** 설명 */
  label: string
}

export interface SimulationDataPoint {
  /** 경과 월 */
  month: number
  /** 경과 년 (소수점) */
  year: number
  /** 자산 합계 */
  value: number
  /** 누적 투입금 (초기 + 적립 + 이벤트) */
  totalContributed: number
  /** 누적 수익 */
  totalGrowth: number
}

export interface SimulationResult {
  /** 시나리오 이름 */
  scenarioName: string
  /** 연 수익률 */
  annualReturn: number
  /** 월간 데이터 포인트 */
  dataPoints: SimulationDataPoint[]
  /** 최종 자산 */
  finalValue: number
  /** 총 투입금 */
  totalContributed: number
  /** 총 수익 */
  totalGrowth: number
}

export interface AccountSimulation {
  accountId: string
  accountName: string
  initialValue: number
  scenarios: SimulationResult[]
  /** 증여세 한도 도달 예상 (개월, null=미도달) */
  giftLimitMonth: number | null
  /** 주요 마일스톤 */
  milestones: Milestone[]
}

export interface Milestone {
  label: string
  month: number
  /** 기본 시나리오 기준 예상 자산 */
  estimatedValue: number
}

/**
 * 단일 시나리오 복리 시뮬레이션
 */
export function simulateCompoundGrowth(input: SimulationInput): SimulationResult {
  const monthlyRate = Math.pow(1 + input.annualReturn, 1 / 12) - 1
  const totalMonths = input.years * 12

  const eventMap = new Map<number, number>()
  for (const event of input.events ?? []) {
    eventMap.set(event.monthOffset, (eventMap.get(event.monthOffset) ?? 0) + event.amount)
  }

  const dataPoints: SimulationDataPoint[] = []
  let value = input.initialValue
  let totalContributed = input.initialValue

  // month 0 = 현재
  dataPoints.push({
    month: 0,
    year: 0,
    value: Math.round(value),
    totalContributed: Math.round(totalContributed),
    totalGrowth: 0,
  })

  for (let m = 1; m <= totalMonths; m++) {
    // 수익 적용
    value *= (1 + monthlyRate)

    // 월 적립
    value += input.monthlyContribution
    totalContributed += input.monthlyContribution

    // 이벤트 유입
    const eventAmount = eventMap.get(m) ?? 0
    if (eventAmount > 0) {
      value += eventAmount
      totalContributed += eventAmount
    }

    dataPoints.push({
      month: m,
      year: m / 12,
      value: Math.round(value),
      totalContributed: Math.round(totalContributed),
      totalGrowth: Math.round(value - totalContributed),
    })
  }

  return {
    scenarioName: '',
    annualReturn: input.annualReturn,
    dataPoints,
    finalValue: Math.round(value),
    totalContributed: Math.round(totalContributed),
    totalGrowth: Math.round(value - totalContributed),
  }
}

/** 기본 시나리오 세트 */
export const DEFAULT_SCENARIOS = [
  { name: '비관', rate: 0.05 },
  { name: '기본', rate: 0.08 },
  { name: '낙관', rate: 0.10 },
] as const

/**
 * 계좌별 3가지 시나리오 시뮬레이션 + 마일스톤 계산
 */
export function simulateAccount(params: {
  accountId: string
  accountName: string
  initialValue: number
  monthlyContribution: number
  years: number
  events?: SimulationEvent[]
  ownerAge?: number | null
  /** 증여 누적액 (미성년 계좌용) */
  giftTotal?: number
  scenarios?: readonly { name: string; rate: number }[]
}): AccountSimulation {
  const scenarios = params.scenarios ?? DEFAULT_SCENARIOS

  if (scenarios.length === 0) {
    return {
      accountId: params.accountId,
      accountName: params.accountName,
      initialValue: params.initialValue,
      scenarios: [],
      giftLimitMonth: null,
      milestones: [],
    }
  }

  const results: SimulationResult[] = scenarios.map((scenario) => {
    const result = simulateCompoundGrowth({
      initialValue: params.initialValue,
      monthlyContribution: params.monthlyContribution,
      years: params.years,
      annualReturn: scenario.rate,
      events: params.events,
    })
    return { ...result, scenarioName: scenario.name }
  })

  // 기본 시나리오 (중간값)
  const baseResult = results.find((r) => r.scenarioName === '기본') ?? results[0]

  // 마일스톤 계산
  const milestones: Milestone[] = []

  if (params.ownerAge != null && params.ownerAge < 20) {
    // 19세 시점 (성인)
    const monthsTo19 = (19 - params.ownerAge) * 12
    if (monthsTo19 > 0 && monthsTo19 <= params.years * 12) {
      const dp = baseResult.dataPoints[monthsTo19]
      if (dp) {
        milestones.push({
          label: '19세 (성인)',
          month: monthsTo19,
          estimatedValue: dp.value,
        })
      }
    }

    // 20세 시점
    const monthsTo20 = (20 - params.ownerAge) * 12
    if (monthsTo20 > 0 && monthsTo20 <= params.years * 12) {
      const dp = baseResult.dataPoints[monthsTo20]
      if (dp) {
        milestones.push({
          label: '20세',
          month: monthsTo20,
          estimatedValue: dp.value,
        })
      }
    }
  }

  // 증여세 한도 도달 예상 시점 (근사치)
  // 미성년 2,000만원 / 성인 5,000만원 (10년간 비과세)
  // 단순 계산: 잔여 한도 / 월 적립금. 10년 rolling window 미반영 (참고용)
  let giftLimitMonth: number | null = null
  if (params.ownerAge != null && params.ownerAge < 19 && params.giftTotal != null) {
    const giftExempt = 20_000_000
    const monthlyGift = params.monthlyContribution
    if (monthlyGift > 0) {
      const remaining = giftExempt - params.giftTotal
      if (remaining > 0) {
        giftLimitMonth = Math.ceil(remaining / monthlyGift)
      } else {
        giftLimitMonth = 0 // 이미 초과
      }
    }
  }

  return {
    accountId: params.accountId,
    accountName: params.accountName,
    initialValue: params.initialValue,
    scenarios: results,
    giftLimitMonth,
    milestones,
  }
}
