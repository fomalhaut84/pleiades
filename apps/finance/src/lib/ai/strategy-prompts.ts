/**
 * 전략별 맞춤 프롬프트 생성
 *
 * 종목의 전략 타입에 따라 AI에게 전달하는 데이터 범위와 조언 요청이 달라진다.
 */

import type { TAReport } from '@/lib/ta/types'

interface HoldingWithStrategy {
  ticker: string
  displayName: string
  accountName: string
  shares: number
  avgPrice: number
  currentPrice: number
  returnPct: number
  currency: string
  strategy: string
  memo?: string | null
  targetPrice?: number | null
  stopLoss?: number | null
  entryLow?: number | null
  entryHigh?: number | null
  reviewDate?: Date | null
  taReport?: TAReport | null
}

/**
 * 전략 타입에 따른 종목별 프롬프트 생성
 */
export function buildStrategyPrompt(h: HoldingWithStrategy): string {
  const base = [
    `[${h.ticker}] ${h.displayName} — ${h.accountName}`,
    `보유: ${h.shares}주, 평단 ${h.avgPrice}, 현재가 ${h.currentPrice} (${h.returnPct >= 0 ? '+' : ''}${h.returnPct.toFixed(1)}%)`,
  ].join('\n')

  switch (h.strategy) {
    case 'long_hold':
      return `${base}\n전략: 장기보유\n→ 뉴스/실적만 간략히. 매매 의견 없이 "보유 유지" 확인.`

    case 'swing':
      return buildSwingPrompt(base, h)

    case 'momentum':
      return buildMomentumPrompt(base, h)

    case 'value':
      return `${base}\n전략: 가치투자\n${h.memo ? `메모: ${h.memo}\n` : ''}→ 펀더멘털 대비 현재가 위치 평가. 매수 구간 의견.`

    case 'watch':
      return buildWatchPrompt(base, h)

    case 'scalp':
      return buildScalpPrompt(base, h)

    default:
      return `${base}\n전략: ${h.strategy}\n→ 현재 상태 요약.`
  }
}

function buildSwingPrompt(base: string, h: HoldingWithStrategy): string {
  const lines = [base, '전략: 스윙']
  if (h.targetPrice != null) lines.push(`목표가: ${h.targetPrice}`)
  if (h.stopLoss != null) lines.push(`손절가: ${h.stopLoss}`)
  if (h.memo) lines.push(`메모: ${h.memo}`)

  if (h.taReport) {
    const ta = h.taReport
    lines.push('\n[기술적 분석]')
    lines.push(`RSI(14): ${ta.indicators.rsi14.value.toFixed(1)} — ${ta.indicators.rsi14.signal}`)
    lines.push(`MACD: ${ta.indicators.macd.trend}${ta.indicators.macd.crossover ? ` (${ta.indicators.macd.crossover})` : ''}`)
    lines.push(`BB: ${ta.indicators.bollingerBands.position}`)
    lines.push(`SMA20: ${ta.indicators.sma.sma20.toFixed(2)}, SMA50: ${ta.indicators.sma.sma50.toFixed(2)}`)
    if (ta.support.length > 0) lines.push(`지지선: ${ta.support.join(', ')}`)
    if (ta.resistance.length > 0) lines.push(`저항선: ${ta.resistance.join(', ')}`)
    lines.push(`시그널: ${ta.signalSummary.overall}`)
  }

  lines.push('\n→ 기술적 위치 해석 + 매수/매도 타이밍 + 목표가/손절 대비 위치 + 리스크')
  return lines.join('\n')
}

function buildMomentumPrompt(base: string, h: HoldingWithStrategy): string {
  const lines = [base, '전략: 모멘텀']
  if (h.memo) lines.push(`메모: ${h.memo}`)

  if (h.taReport) {
    const ta = h.taReport
    lines.push(`SMA20 대비: ${ta.indicators.sma.priceVsSma20 >= 0 ? '+' : ''}${ta.indicators.sma.priceVsSma20.toFixed(1)}%`)
    lines.push(`거래량: ${ta.indicators.volume.ratio.toFixed(1)}배${ta.indicators.volume.surge ? ' (급증)' : ''}`)
    lines.push(`시그널: ${ta.signalSummary.overall}`)
  }

  lines.push('\n→ 추세 지속 여부 + 돌파/이탈 시그널 + 눌림목 매수 구간')
  return lines.join('\n')
}

function buildWatchPrompt(base: string, h: HoldingWithStrategy): string {
  const lines = [base, '전략: 감시 (매도 검토 중)']
  if (h.memo) lines.push(`점검 기준: ${h.memo}`)
  if (h.reviewDate) {
    const daysUntil = Math.ceil((h.reviewDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    lines.push(`점검일: ${h.reviewDate.toISOString().slice(0, 10)} (D${daysUntil >= 0 ? '-' : '+'}${Math.abs(daysUntil)})`)
  }

  if (h.taReport) {
    lines.push(`시그널: ${h.taReport.signalSummary.overall}`)
  }

  lines.push('\n→ 점검 기준 대비 현재 상태 평가 + 매도/홀드 판단 근거')
  return lines.join('\n')
}

function buildScalpPrompt(base: string, h: HoldingWithStrategy): string {
  const lines = [base, '전략: 단타']
  if (h.targetPrice != null) lines.push(`목표가: ${h.targetPrice}`)
  if (h.stopLoss != null) lines.push(`손절가: ${h.stopLoss}`)

  if (h.taReport) {
    const ta = h.taReport
    lines.push(`RSI: ${ta.indicators.rsi14.value.toFixed(1)}`)
    lines.push(`BB: ${ta.indicators.bollingerBands.position}`)
    if (ta.support.length > 0) lines.push(`지지선: ${ta.support.join(', ')}`)
    if (ta.resistance.length > 0) lines.push(`저항선: ${ta.resistance.join(', ')}`)
    lines.push(`거래량: ${ta.indicators.volume.ratio.toFixed(1)}배`)
  }

  lines.push('\n→ 당일 지지/저항 + 진입가/목표가/손절가 + 리스크 경고')
  return lines.join('\n')
}
