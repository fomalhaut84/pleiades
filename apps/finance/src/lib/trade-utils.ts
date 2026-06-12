/**
 * Trade → Holding 재계산 유틸리티
 * 순수 함수로 구성하여 API route에서 호출.
 */

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
export interface TradeValidationError {
  field: string
  message: string
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const MIN_TRADE_DATE = '2000-01-01'

/** ms 타임스탬프를 KST 캘린더 날짜 문자열(YYYY-MM-DD)로 변환 */
function toKSTDateString(ms: number): string {
  const d = new Date(ms + KST_OFFSET_MS)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
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
export function validateTradedAt(tradedAt: string | undefined | null): string | null {
  if (!tradedAt || isNaN(Date.parse(tradedAt))) return '유효한 거래일을 입력해주세요.'
  const tradedAtKST = toKSTDateString(Date.parse(tradedAt))
  const todayKST = toKSTDateString(Date.now())
  if (tradedAtKST > todayKST) return '미래 날짜는 입력할 수 없습니다.'
  if (tradedAtKST < MIN_TRADE_DATE) return '2000-01-01 이후 날짜를 입력해주세요.'
  return null
}

export function validateTradeInput(body: {
  accountId?: string
  ticker?: string
  displayName?: string
  market?: string
  type?: string
  shares?: number
  price?: number
  currency?: string
  fxRate?: number | null
  tradedAt?: string
}): TradeValidationError[] {
  const errors: TradeValidationError[] = []

  if (!body.accountId) errors.push({ field: 'accountId', message: '계좌를 선택해주세요.' })
  if (!body.ticker?.trim()) errors.push({ field: 'ticker', message: '종목을 선택해주세요.' })
  if (!body.displayName?.trim()) errors.push({ field: 'displayName', message: '종목명을 입력해주세요.' })
  if (!body.market || !['US', 'KR'].includes(body.market)) {
    errors.push({ field: 'market', message: '시장을 선택해주세요 (US/KR).' })
  }
  if (!body.type || !['BUY', 'SELL'].includes(body.type)) {
    errors.push({ field: 'type', message: '거래 유형을 선택해주세요 (BUY/SELL).' })
  }
  if (typeof body.shares !== 'number' || !Number.isFinite(body.shares) || body.shares <= 0 || !Number.isInteger(body.shares)) {
    errors.push({ field: 'shares', message: '수량은 1 이상의 정수여야 합니다.' })
  }
  if (typeof body.price !== 'number' || !Number.isFinite(body.price) || body.price <= 0) {
    errors.push({ field: 'price', message: '단가는 0보다 큰 숫자여야 합니다.' })
  }
  if (!body.currency || !['USD', 'KRW'].includes(body.currency)) {
    errors.push({ field: 'currency', message: '통화를 선택해주세요 (USD/KRW).' })
  }
  if (body.currency === 'USD' && (typeof body.fxRate !== 'number' || !Number.isFinite(body.fxRate) || body.fxRate <= 0)) {
    errors.push({ field: 'fxRate', message: 'USD 종목은 유효한 환율을 입력해야 합니다.' })
  }
  if (body.market === 'US' && body.currency && body.currency !== 'USD') {
    errors.push({ field: 'currency', message: 'US 시장은 USD 통화만 가능합니다.' })
  }
  if (body.market === 'KR' && body.currency && body.currency !== 'KRW') {
    errors.push({ field: 'currency', message: 'KR 시장은 KRW 통화만 가능합니다.' })
  }
  const tradedAtError = validateTradedAt(body.tradedAt)
  if (tradedAtError) errors.push({ field: 'tradedAt', message: tradedAtError })

  return errors
}
