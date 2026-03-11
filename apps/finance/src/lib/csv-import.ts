import type { TradeField, ColumnMapping, MappedRow, ValidatedRow } from '@/types/csv-import'

/** 헤더 이름 → TradeField 휴리스틱 매핑 */
const HEADER_PATTERNS: Array<{ patterns: RegExp[]; field: TradeField }> = [
  {
    field: 'ticker',
    patterns: [
      /^ticker$/i,
      /^symbol$/i,
      /종목\s*코드/,
      /티커/,
      /^code$/i,
    ],
  },
  {
    field: 'displayName',
    patterns: [
      /^name$/i,
      /^display\s*name$/i,
      /종목\s*명/,
      /종목\s*이름/,
      /^상품명$/,
    ],
  },
  {
    field: 'type',
    patterns: [
      /^type$/i,
      /^side$/i,
      /^action$/i,
      /매매\s*구분/,
      /거래\s*구분/,
      /거래\s*유형/,
      /^구분$/,
    ],
  },
  {
    field: 'shares',
    patterns: [
      /^shares$/i,
      /^quantity$/i,
      /^qty$/i,
      /^수량$/,
      /거래\s*수량/,
      /체결\s*수량/,
    ],
  },
  {
    field: 'price',
    patterns: [
      /^price$/i,
      /^단가$/,
      /체결\s*단가/,
      /체결\s*가/,
      /거래\s*단가/,
    ],
  },
  {
    field: 'fxRate',
    patterns: [
      /^fx\s*rate$/i,
      /^exchange\s*rate$/i,
      /환율/,
      /적용\s*환율/,
    ],
  },
  {
    field: 'tradedAt',
    patterns: [
      /^date$/i,
      /^traded?\s*at$/i,
      /^trade\s*date$/i,
      /거래\s*일/,
      /체결\s*일/,
      /^일자$/,
      /^날짜$/,
    ],
  },
  {
    field: 'note',
    patterns: [
      /^note$/i,
      /^memo$/i,
      /^메모$/,
      /^비고$/,
      /^적요$/,
    ],
  },
]

/**
 * CSV 헤더 기반 자동 컬럼 매핑.
 * 매칭 안 되는 헤더는 null로 남긴다.
 */
export function autoDetectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {}
  const usedFields = new Set<TradeField>()

  for (const header of headers) {
    const trimmed = header.trim()
    let matched: TradeField | null = null

    for (const { patterns, field } of HEADER_PATTERNS) {
      if (usedFields.has(field)) continue
      if (patterns.some((p) => p.test(trimmed))) {
        matched = field
        usedFields.add(field)
        break
      }
    }

    mapping[header] = matched
  }

  return mapping
}

/** 다양한 매수/매도 표현을 BUY/SELL로 정규화 */
export function normalizeTradeType(value: string): 'BUY' | 'SELL' | null {
  const v = value.trim().toUpperCase()

  const buyPatterns = ['BUY', '매수', 'B', 'PURCHASE', '매입']
  const sellPatterns = ['SELL', '매도', 'S', 'SALE', '매각']

  if (buyPatterns.includes(v)) return 'BUY'
  if (sellPatterns.includes(v)) return 'SELL'

  return null
}

/**
 * 유연한 날짜 파싱.
 * 지원 형식: YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD, YYYYMMDD, MM/DD/YYYY
 */
export function parseFlexibleDate(value: string): string | null {
  const v = value.trim()

  // YYYYMMDD
  const compact = v.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (compact) {
    const result = `${compact[1]}-${compact[2]}-${compact[3]}`
    return isValidDate(result) ? result : null
  }

  // YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD
  const ymd = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (ymd) {
    const m = ymd[2].padStart(2, '0')
    const d = ymd[3].padStart(2, '0')
    const result = `${ymd[1]}-${m}-${d}`
    return isValidDate(result) ? result : null
  }

  // MM/DD/YYYY
  const mdy = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdy) {
    const m = mdy[1].padStart(2, '0')
    const d = mdy[2].padStart(2, '0')
    const result = `${mdy[3]}-${m}-${d}`
    return isValidDate(result) ? result : null
  }

  // ISO 8601 with time
  const iso = Date.parse(v)
  if (!isNaN(iso)) {
    const date = new Date(iso)
    const y = date.getUTCFullYear()
    const m = String(date.getUTCMonth() + 1).padStart(2, '0')
    const d = String(date.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  return null
}

/** YYYY-MM-DD 문자열의 날짜 유효성 검증 (2024-02-31 같은 불가능 날짜 차단) */
function isValidDate(dateStr: string): boolean {
  const date = new Date(dateStr + 'T00:00:00Z')
  if (isNaN(date.getTime())) return false
  const [y, m, d] = dateStr.split('-').map(Number)
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() + 1 === m &&
    date.getUTCDate() === d
  )
}

/** 쉼표/공백 제거 후 숫자 파싱 */
function parseNumber(value: string): number {
  const cleaned = value.replace(/[,\s]/g, '')
  return parseFloat(cleaned)
}

/**
 * 매핑을 적용하여 CSV 행을 MappedRow로 변환.
 */
export function applyMapping(
  row: Record<string, string>,
  mapping: ColumnMapping,
  currency: 'USD' | 'KRW'
): MappedRow {
  const getValue = (field: TradeField): string => {
    for (const [col, f] of Object.entries(mapping)) {
      if (f === field) return (row[col] ?? '').trim()
    }
    return ''
  }

  const rawType = getValue('type')
  const type = normalizeTradeType(rawType)

  const rawDate = getValue('tradedAt')
  const parsedDate = parseFlexibleDate(rawDate)

  const rawShares = getValue('shares')
  const shares = rawShares ? parseNumber(rawShares) : 0

  const rawPrice = getValue('price')
  const price = rawPrice ? parseNumber(rawPrice) : 0

  const rawFxRate = getValue('fxRate')
  const fxRate = currency === 'USD' && rawFxRate ? parseNumber(rawFxRate) : null

  return {
    ticker: getValue('ticker').toUpperCase().replace(/\s/g, ''),
    displayName: getValue('displayName') || getValue('ticker'),
    type,
    shares,
    price,
    fxRate,
    tradedAt: parsedDate ?? '',
    note: getValue('note'),
  }
}

/**
 * 매핑된 행을 검증.
 * 기존 거래 목록(existingTrades)과 비교하여 중복도 체크.
 */
export function validateRows(
  rows: MappedRow[],
  existingTrades: Array<{
    ticker: string
    type: string
    tradedAt: string // YYYY-MM-DD
    shares: number
    price: number
  }>,
  currency: 'USD' | 'KRW'
): ValidatedRow[] {
  const existingSet = new Set(
    existingTrades.map(
      (t) => `${t.ticker}|${t.type}|${t.tradedAt}|${t.shares}|${Number(Number(t.price).toFixed(4))}`
    )
  )

  // 같은 배치 내 중복도 감지
  const batchSet = new Set<string>()

  return rows.map((data, i) => {
    const errors: Array<{ field: string; message: string }> = []

    if (!data.ticker) {
      errors.push({ field: 'ticker', message: '티커가 비어있습니다.' })
    }
    if (!data.type) {
      errors.push({ field: 'type', message: '매수/매도 구분을 인식할 수 없습니다.' })
    }
    if (!data.tradedAt) {
      errors.push({ field: 'tradedAt', message: '거래일을 파싱할 수 없습니다.' })
    }
    if (!data.shares || data.shares <= 0) {
      errors.push({ field: 'shares', message: '수량은 1 이상이어야 합니다.' })
    }
    if (!Number.isInteger(data.shares)) {
      errors.push({ field: 'shares', message: '수량은 정수여야 합니다.' })
    }
    if (!data.price || data.price <= 0) {
      errors.push({ field: 'price', message: '단가는 0보다 커야 합니다.' })
    }
    if (currency === 'USD') {
      if (data.fxRate == null) {
        errors.push({ field: 'fxRate', message: 'USD 종목은 환율이 필요합니다.' })
      } else if (data.fxRate <= 0) {
        errors.push({ field: 'fxRate', message: '환율은 0보다 커야 합니다.' })
      }
    }

    if (errors.length > 0) {
      return { rowIndex: i, status: 'error' as const, data, errors }
    }

    const key = `${data.ticker}|${data.type}|${data.tradedAt}|${data.shares}|${Number(data.price.toFixed(4))}`
    if (existingSet.has(key) || batchSet.has(key)) {
      return { rowIndex: i, status: 'duplicate' as const, data, errors: [] }
    }
    batchSet.add(key)

    return { rowIndex: i, status: 'valid' as const, data, errors: [] }
  })
}
