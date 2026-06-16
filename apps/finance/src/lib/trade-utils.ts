/**
 * Trade → Holding 재계산 유틸리티
 * 순수 함수로 구성하여 API route에서 호출.
 */

import { z } from 'zod'
import { zodErrorsToValidation, type ValidationError } from './zod-utils'

interface TradeInput {
  type: string       // "BUY" | "SELL"
  shares: number
  price: number      // 체결가 (원본 통화)
  currency: string   // "USD" | "KRW"
  fxRate?: number | null
}

export interface HoldingState {
  shares: number
  avgPrice: number       // 원화 기준 평균단가
  avgPriceFx: number | null   // USD 평균단가
  avgFxRate: number | null    // 가중평균 환율
}

/**
 * Trade 목록(tradedAt 오름차순)으로부터 Holding 상태를 재계산.
 * 거래 수정/삭제 시 전체 거래를 다시 순회하여 정확한 상태 산출.
 */
export function recalcHolding(trades: TradeInput[]): HoldingState {
  let shares = 0
  let avgPriceFx: number = 0
  let avgFxRate: number = 0
  let avgPrice: number = 0

  for (const trade of trades) {
    if (trade.type === 'BUY') {
      if (trade.currency === 'USD') {
        const fxRate = trade.fxRate ?? 0
        const newShares = shares + trade.shares
        avgPriceFx = newShares > 0
          ? (shares * avgPriceFx + trade.shares * trade.price) / newShares
          : 0
        avgFxRate = newShares > 0
          ? (shares * avgFxRate + trade.shares * fxRate) / newShares
          : 0
        avgPrice = Math.round(avgPriceFx * avgFxRate)
        shares = newShares
      } else {
        const newShares = shares + trade.shares
        avgPrice = newShares > 0
          ? Math.round((shares * avgPrice + trade.shares * trade.price) / newShares)
          : 0
        shares = newShares
      }
    } else if (trade.type === 'SELL') {
      shares = shares - trade.shares
      if (shares < 0) {
        throw new Error(`보유 수량 부족: ${trade.shares}주 매도 시도, 현재 ${shares + trade.shares}주`)
      }
      // 이동평균법: avgPrice, avgPriceFx, avgFxRate 변동 없음
    }
  }

  if (shares === 0) {
    return { shares: 0, avgPrice: 0, avgPriceFx: null, avgFxRate: null }
  }

  const isUSD = trades.some((t) => t.currency === 'USD')
  return {
    shares,
    avgPrice,
    avgPriceFx: isUSD ? avgPriceFx : null,
    avgFxRate: isUSD ? avgFxRate : null,
  }
}

/**
 * 거래 총액(KRW) 계산
 */
export function calcTotalKRW(
  price: number,
  shares: number,
  currency: string,
  fxRate?: number | null
): number {
  if (currency === 'USD') {
    return Math.round(price * shares * (fxRate ?? 0))
  }
  return Math.round(price * shares)
}

/**
 * 거래 입력 검증
 */
export type TradeValidationError = ValidationError

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const MIN_TRADE_DATE = '2000-01-01'

/** ms 타임스탬프를 KST 캘린더 날짜 문자열(YYYY-MM-DD)로 변환 */
function toKSTDateString(ms: number): string {
  const d = new Date(ms + KST_OFFSET_MS)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/**
 * USD 거래/배당의 환율을 검증한다. 통과 시 null, 실패 시 사용자 메시지.
 * 양수 + finite number만 허용. null/undefined/0/NaN 모두 거부.
 * @param label 에러 메시지의 도메인 라벨 (예: 'USD 종목', 'USD 배당')
 */
export function validateFxRateForUSD(fxRate: unknown, label = 'USD 종목'): string | null {
  if (typeof fxRate !== 'number' || !Number.isFinite(fxRate) || fxRate <= 0) {
    return `${label}은 유효한 환율이 필요합니다.`
  }
  return null
}

/**
 * 거래일 문자열을 검증한다. 통과 시 null, 실패 시 사용자 메시지 반환.
 * - parse 불가
 * - KST 캘린더 기준 오늘보다 미래 (사용자 KST 기준 "내일 이후" 입력 차단)
 * - 2000-01-01 미만
 *
 * 단순한 `Date.now() + 1일` grace는 KST 사용자가 오후~저녁에 내일 날짜(UTC midnight
 * 기준 < now+24h)를 입력하면 통과시키는 결함이 있어, KST 캘린더 날짜로 직접 비교.
 */
export function validateTradedAt(tradedAt: unknown): string | null {
  if (typeof tradedAt !== 'string' || isNaN(Date.parse(tradedAt))) {
    return '유효한 거래일을 입력해주세요.'
  }
  const tradedAtKST = toKSTDateString(Date.parse(tradedAt))
  const todayKST = toKSTDateString(Date.now())
  if (tradedAtKST > todayKST) return '미래 날짜는 입력할 수 없습니다.'
  if (tradedAtKST < MIN_TRADE_DATE) return '2000-01-01 이후 날짜를 입력해주세요.'
  return null
}

const TradeInputSchema = z
  .object({
    accountId: z
      .string({ message: '계좌를 선택해주세요.' })
      .min(1, { message: '계좌를 선택해주세요.' }),
    ticker: z
      .string({ message: '종목을 선택해주세요.' })
      .trim()
      .min(1, { message: '종목을 선택해주세요.' }),
    displayName: z
      .string({ message: '종목명을 입력해주세요.' })
      .trim()
      .min(1, { message: '종목명을 입력해주세요.' }),
    market: z.enum(['US', 'KR'], { message: '시장을 선택해주세요 (US/KR).' }),
    type: z.enum(['BUY', 'SELL'], { message: '거래 유형을 선택해주세요 (BUY/SELL).' }),
    shares: z
      .number({ message: '수량은 1 이상의 정수여야 합니다.' })
      .int({ message: '수량은 1 이상의 정수여야 합니다.' })
      .positive({ message: '수량은 1 이상의 정수여야 합니다.' })
      .finite({ message: '수량은 1 이상의 정수여야 합니다.' }),
    price: z
      .number({ message: '단가는 0보다 큰 숫자여야 합니다.' })
      .positive({ message: '단가는 0보다 큰 숫자여야 합니다.' })
      .finite({ message: '단가는 0보다 큰 숫자여야 합니다.' }),
    currency: z.enum(['USD', 'KRW'], { message: '통화를 선택해주세요 (USD/KRW).' }),
    // fxRate / tradedAt 의 형식 검증은 USD 분기 + validateTradedAt 헬퍼가 한국어 메시지로
    // 통일 처리하므로 schema 단계에서는 type-level 영문 메시지가 노출되지 않도록 unknown 으로 받는다.
    // (CSV import 가 Number(...) 변환 결과 NaN 을 전달하는 케이스도 동일 흐름)
    fxRate: z.unknown().optional(),
    tradedAt: z.unknown().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.currency === 'USD') {
      const fxError = validateFxRateForUSD(data.fxRate)
      if (fxError) ctx.addIssue({ code: 'custom', path: ['fxRate'], message: fxError })
    }
    if (data.market === 'US' && data.currency !== 'USD') {
      ctx.addIssue({ code: 'custom', path: ['currency'], message: 'US 시장은 USD 통화만 가능합니다.' })
    }
    if (data.market === 'KR' && data.currency !== 'KRW') {
      ctx.addIssue({ code: 'custom', path: ['currency'], message: 'KR 시장은 KRW 통화만 가능합니다.' })
    }
    const tradedAtError = validateTradedAt(data.tradedAt)
    if (tradedAtError) ctx.addIssue({ code: 'custom', path: ['tradedAt'], message: tradedAtError })
  })

export function validateTradeInput(body: unknown): TradeValidationError[] {
  const result = TradeInputSchema.safeParse(body)
  if (result.success) return []
  return zodErrorsToValidation(result.error)
}
