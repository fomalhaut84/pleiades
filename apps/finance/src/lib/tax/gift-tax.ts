/**
 * 증여세 계산 유틸리티
 *
 * 미성년(19세 미만): 10년간 2,000만원 비과세
 * 성인(19세 이상): 10년간 5,000만원 비과세
 * 초과 시 누진세율 적용
 */

/** 비과세 한도 (원) */
export const GIFT_TAX_EXEMPT_MINOR = 20_000_000 // 미성년
export const GIFT_TAX_EXEMPT_ADULT = 50_000_000 // 성인

/** 증여로 인정되는 source 값 (소문자 기준, DB 쿼리에서도 사용) */
export const GIFT_SOURCES = ['증여', 'gift']

/** 누진세율 구간 */
const GIFT_TAX_BRACKETS = [
  { limit: 100_000_000, rate: 0.10 },  // 1억 이하 10%
  { limit: 500_000_000, rate: 0.20 },  // 5억 이하 20%
  { limit: 1_000_000_000, rate: 0.30 }, // 10억 이하 30%
  { limit: 3_000_000_000, rate: 0.40 }, // 30억 이하 40%
  { limit: Infinity, rate: 0.50 },      // 30억 초과 50%
] as const

export interface GiftTaxSummary {
  /** 10년 윈도우 내 증여 총액 */
  totalGifted: number
  /** 비과세 한도 */
  exemptLimit: number
  /** 사용률 (0~1+) */
  usageRate: number
  /** 잔여 한도 (음수면 초과) */
  remaining: number
  /** 초과분에 대한 예상 세금 */
  estimatedTax: number
  /** 10년 리셋 시점 (윈도우 내 가장 오래된 증여일 + 10년) */
  resetDate: Date | null
  /** 전체 최초 증여일 */
  firstGiftDate: Date | null
}

interface Deposit {
  amount: number
  source: string
  depositedAt: Date | string
}

/** 날짜의 시각을 00:00:00으로 절삭 (날짜 단위 비교용) */
function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/** 캘린더 기준 N년 전 날짜 계산 (시각 절삭) */
function subYears(date: Date, years: number): Date {
  const result = startOfDay(date)
  result.setFullYear(result.getFullYear() - years)
  return result
}

function isGiftSource(source: string): boolean {
  return GIFT_SOURCES.includes(source.toLowerCase())
}

/**
 * 계좌의 증여세 현황 계산
 * @param deposits 해당 계좌의 전체 입금 내역
 * @param isMinor 미성년 여부
 * @param referenceDate 기준일 (기본: 오늘)
 */
export function calcGiftTaxSummary(
  deposits: Deposit[],
  isMinor: boolean,
  referenceDate: Date = new Date()
): GiftTaxSummary {
  const exemptLimit = isMinor ? GIFT_TAX_EXEMPT_MINOR : GIFT_TAX_EXEMPT_ADULT

  // 증여 건만 필터 ('증여' 또는 'gift')
  const gifts = deposits.filter((d) => isGiftSource(d.source))

  if (gifts.length === 0) {
    return {
      totalGifted: 0,
      exemptLimit,
      usageRate: 0,
      remaining: exemptLimit,
      estimatedTax: 0,
      resetDate: null,
      firstGiftDate: null,
    }
  }

  // 날짜 순 정렬
  const sorted = [...gifts].sort(
    (a, b) => new Date(a.depositedAt).getTime() - new Date(b.depositedAt).getTime()
  )

  const firstGiftDate = new Date(sorted[0].depositedAt)

  // 캘린더 기준 10년 윈도우
  const windowStart = subYears(referenceDate, 10)

  // 10년 윈도우 내 증여만 (날짜 단위 비교 — 경계일 포함, 미래 제외)
  const refDay = startOfDay(referenceDate)
  const windowGifts = sorted.filter((d) => {
    const day = startOfDay(new Date(d.depositedAt)).getTime()
    return day >= windowStart.getTime() && day <= refDay.getTime()
  })
  const totalGifted = windowGifts.reduce((sum, d) => sum + d.amount, 0)

  // 리셋 시점: 윈도우 내 가장 오래된 증여일 + 10년
  const oldestInWindow = windowGifts.length > 0 ? new Date(windowGifts[0].depositedAt) : null
  const resetDate = oldestInWindow
    ? new Date(new Date(oldestInWindow).setFullYear(oldestInWindow.getFullYear() + 10))
    : null

  const remaining = exemptLimit - totalGifted
  const usageRate = exemptLimit > 0 ? totalGifted / exemptLimit : 0
  const estimatedTax = calcProgressiveTax(Math.max(0, totalGifted - exemptLimit))

  return {
    totalGifted,
    exemptLimit,
    usageRate,
    remaining,
    estimatedTax,
    resetDate,
    firstGiftDate,
  }
}

/**
 * 누진세율로 세금 계산
 */
export function calcProgressiveTax(taxableAmount: number): number {
  if (taxableAmount <= 0) return 0

  let tax = 0
  let prev = 0

  for (const bracket of GIFT_TAX_BRACKETS) {
    const taxableInBracket = Math.min(taxableAmount, bracket.limit) - prev
    if (taxableInBracket <= 0) break
    tax += taxableInBracket * bracket.rate
    prev = bracket.limit
  }

  return Math.round(tax)
}
