/**
 * 거래 키워드 감지
 *
 * 자연어 메시지에서 매수/매도 의도를 감지한다.
 * 오탐 방지: 거래 키워드 + 컨텍스트 조건(계좌명/종목/주 단위) 동시 충족 필요.
 */

const TRADE_VERBS = [
  '샀어', '샀다', '샀음', '사놨',
  '매수했', '매수함', '매수 했',
  '팔았어', '팔았다', '팔았음',
  '매도했', '매도함', '매도 했',
]

const ACCOUNT_NAMES = ['세진', '소담', '다솜']

/**
 * 텍스트가 주식 거래 의도인지 판별
 * 거래 동사 + (계좌명 또는 "주" 단위) 동시 포함 시에만 true
 */
export function isTradeMessage(text: string): boolean {
  const hasTradeVerb = TRADE_VERBS.some((v) => text.includes(v))
  if (!hasTradeVerb) return false

  const hasAccount = ACCOUNT_NAMES.some((n) => text.includes(n))
  const hasShareUnit = /\d+\s*주/.test(text)

  return hasAccount || hasShareUnit
}
