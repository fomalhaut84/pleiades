/**
 * 거래 전후 Holding 변화를 사용자 친화 문장으로 포맷.
 * 토스트 알림에 사용.
 */

export interface HoldingSnapshot {
  shares: number
  avgPrice: number              // KRW 환산
  avgPriceFx: number | null     // USD 평단가 (USD 종목만)
  avgFxRate: number | null
}

export interface HoldingDiff {
  title: string
  description: string
}

interface FormatArgs {
  ticker: string
  displayName: string
  type: 'BUY' | 'SELL'
  shares: number
  before: HoldingSnapshot | null
  after: HoldingSnapshot | null
  currency: string
}

function formatPrice(holding: HoldingSnapshot, currency: string): string {
  if (currency === 'USD' && holding.avgPriceFx != null) {
    return `$${holding.avgPriceFx.toFixed(2)}`
  }
  return `${Math.round(holding.avgPrice).toLocaleString('ko-KR')}원`
}

function priceUnchanged(before: HoldingSnapshot, after: HoldingSnapshot, currency: string): boolean {
  if (currency === 'USD' && before.avgPriceFx != null && after.avgPriceFx != null) {
    return Math.abs(before.avgPriceFx - after.avgPriceFx) < 0.005
  }
  return Math.abs(before.avgPrice - after.avgPrice) < 0.5
}

export function formatHoldingDiff(args: FormatArgs): HoldingDiff {
  const { ticker, displayName, type, shares, before, after, currency } = args
  const name = displayName || ticker

  // 전량 매도 (after === null 또는 shares=0)
  if (!after || after.shares === 0) {
    return {
      title: `${name} ${shares}주 매도`,
      description: '보유 종료',
    }
  }

  // 첫 매수 (before === null 또는 shares=0)
  if (!before || before.shares === 0) {
    return {
      title: `${name} ${shares}주 매수`,
      description: `신규 보유 (평단 ${formatPrice(after, currency)})`,
    }
  }

  const priceParts = priceUnchanged(before, after, currency)
    ? '평단 변동 없음'
    : `평단 ${formatPrice(before, currency)} → ${formatPrice(after, currency)}`

  if (type === 'BUY') {
    return {
      title: `${name} ${shares}주 매수`,
      description: `보유 ${before.shares} → ${after.shares}주, ${priceParts}`,
    }
  }

  // SELL (부분)
  return {
    title: `${name} ${shares}주 매도`,
    description: `보유 ${before.shares} → ${after.shares}주 (${priceParts})`,
  }
}

/**
 * 거래 수정 후 변경된 holding 을 알리는 별도 포맷 (BUY/SELL 구분 없음).
 */
export function formatHoldingEditDiff(args: {
  ticker: string
  displayName: string
  before: HoldingSnapshot | null
  after: HoldingSnapshot | null
  currency: string
}): HoldingDiff {
  const { ticker, displayName, before, after, currency } = args
  const name = displayName || ticker

  if (!after || after.shares === 0) {
    return {
      title: `${name} 거래 수정`,
      description: '보유 종료',
    }
  }

  if (!before || before.shares === 0) {
    return {
      title: `${name} 거래 수정`,
      description: `보유 ${after.shares}주, 평단 ${formatPrice(after, currency)}`,
    }
  }

  const shareParts = before.shares === after.shares
    ? `보유 ${after.shares}주 (수량 변동 없음)`
    : `보유 ${before.shares} → ${after.shares}주`
  const priceParts = priceUnchanged(before, after, currency)
    ? '평단 변동 없음'
    : `평단 ${formatPrice(before, currency)} → ${formatPrice(after, currency)}`

  return {
    title: `${name} 거래 수정`,
    description: `${shareParts}, ${priceParts}`,
  }
}
