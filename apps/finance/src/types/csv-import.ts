/** CSV 임포트에 사용되는 Trade 필드 이름 */
export type TradeField =
  | 'ticker'
  | 'displayName'
  | 'type'
  | 'shares'
  | 'price'
  | 'fxRate'
  | 'tradedAt'
  | 'note'

/** CSV 컬럼 → Trade 필드 매핑 */
export type ColumnMapping = Record<string, TradeField | null>

/** 매핑 적용 결과 (단일 행) */
export interface MappedRow {
  ticker: string
  displayName: string
  type: 'BUY' | 'SELL' | null
  shares: number
  price: number
  fxRate: number | null
  tradedAt: string // ISO 8601
  note: string
}

/** 검증된 행 */
export interface ValidatedRow {
  rowIndex: number
  status: 'valid' | 'duplicate' | 'error'
  data: MappedRow
  errors: Array<{ field: string; message: string }>
}

/** 임포트 결과 */
export interface ImportResult {
  total: number
  created: number
  skipped: number
  failed: number
  errors: Array<{ row: number; field: string; message: string }>
}

/** 임포트 API 요청 바디 */
export interface ImportRequest {
  accountId: string
  market: 'US' | 'KR'
  currency: 'USD' | 'KRW'
  skipDuplicates: boolean
  trades: Array<{
    ticker: string
    displayName: string
    type: 'BUY' | 'SELL'
    shares: number
    price: number
    fxRate?: number | null
    tradedAt: string
    note?: string
  }>
}

/** Trade 필드 메타데이터 (매핑 UI용) */
export const TRADE_FIELD_LABELS: Record<TradeField, string> = {
  ticker: '티커 / 종목코드',
  displayName: '종목명',
  type: '매수/매도',
  shares: '수량',
  price: '단가',
  fxRate: '환율',
  tradedAt: '거래일',
  note: '메모',
}

export const REQUIRED_FIELDS: TradeField[] = [
  'ticker',
  'type',
  'shares',
  'price',
  'tradedAt',
]
