/**
 * 클라이언트에서 사용하는 CustomStrategy row 타입.
 * API 라우트가 반환하는 형태 (ISO 8601 timestamps).
 */
export interface CustomStrategyRow {
  id: string
  name: string
  description: string | null
  ticker: string
  conditions: unknown  // Condition[] JSON — 표시 시 conditionToString 로 안전 변환
  logic: string        // 'AND' | 'OR'
  frequency: string    // 'once' | 'daily' | 'always'
  isActive: boolean
  lastTriggeredAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ParsedStrategyPreview {
  name: string
  ticker: string
  conditions: Array<{
    type: string
    operator: string
    value: number | string
    timeframe?: string
  }>
  logic: string
  frequency: string
}
