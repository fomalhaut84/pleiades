/**
 * Custom strategy natural language parser — 사용자 자연어 → 구조화 Condition[].
 *
 * askAdvisor (claude -p) 를 활용해 JSON 형태로 파싱. 유효성은 validateParsedStrategy 로 방어.
 * 실패 시 명확한 사유 throw → 사용자에게 되묻기.
 *
 * 매 등록 시 1회만 호출 (cron 은 evaluator 로 순수 코드 평가).
 */

import { askAdvisor } from '@/lib/ai/claude-advisor'
import { validateParsedStrategy, type ParsedStrategy } from './types'

export const PROMPT_HEADER = `
사용자 입력을 아래 JSON schema 로 정확히 파싱해줘. 오직 JSON 오브젝트만 출력 — 다른 설명/코드블록 없이.

## 지원 조건 타입 (v1)
- price (숫자, ticker 현재가)
- rsi (숫자, RSI14 값)
- macd_signal (문자열, "GOLDEN" 또는 "DEAD")
- sma_cross (문자열, "GOLDEN" 또는 "DEAD")
- bb_position (문자열, "BELOW_LOWER" 또는 "ABOVE_UPPER")
- change_pct (숫자, timeframe 필수 — "1d" | "5d" | "20d")

## 지원 조건 타입 (v2 — 시간/보유 필터)
- time_window (문자열 "HH:MM~HH:MM", KST 24h. 자정 wraparound 허용 — 예 "23:00~02:00")
- weekday (배열, 요일 코드 ["MON","TUE","WED","THU","FRI","SAT","SUN"] 중 부분집합)
- holding_status (문자열, "HELD" 또는 "NOT_HELD" — 사용자가 해당 ticker 보유 여부)

## 지원 조건 타입 (v3 — 어닝 캘린더 / 크로스-티커)
- earnings_within_days (숫자 정수, 0 이상, 다음 어닝까지 남은 일수 — Yahoo Finance 캘린더)
- cross_ticker — 다른 티커의 지표 비교. 필수 필드:
  - crossTicker: 참조 티커 (대문자 정규화). 자기 자신 참조 금지
  - metric: 아래 6종
    - "price" / "change_percent" — 숫자 비교. operator 는 < / <= / > / >= / ==. value 는 숫자
    - "rsi" — 0~100 숫자. operator 는 < / <= / > / >= / ==. value 는 0~100
    - "macd_signal" — value 는 정수 (1=GOLDEN, 0=NONE, -1=DEAD). operator 는 "==" 만
    - "sma_cross" — value 는 정수 (1=GOLDEN, -1=DEAD). operator 는 "==" 만
    - "bb_position" — value 는 정수 (1=ABOVE_UPPER, 0=WITHIN, -1=BELOW_LOWER). operator 는 "==" 만

## 연산자
- 숫자 타입: < <= > >= ==
- 문자열/배열 타입: is (전용)

## logic (AND | OR)
## frequency (once | daily | always)

## 출력 스키마
{
  "name": "짧은 요약 (예: 'SOXL 저점 매수')",
  "ticker": "SOXL",  // 대문자 정규화
  "conditions": [
    { "type": "price", "operator": "<=", "value": 40 },
    { "type": "rsi", "operator": "<=", "value": 30 }
  ],
  "logic": "AND",
  "frequency": "daily"
}

## v2 예시
- "SOXL 40달러 이하 시 알림, 단 미국장 시간대 (KST 22:30~05:00) 에만" →
  {"conditions": [
    {"type":"price","operator":"<=","value":40},
    {"type":"time_window","operator":"is","value":"22:30~05:00"}
  ], "logic":"AND"}
- "NVDA MACD 골든크로스 시 알림 (평일만)" →
  {"conditions": [
    {"type":"macd_signal","operator":"is","value":"GOLDEN"},
    {"type":"weekday","operator":"is","value":["MON","TUE","WED","THU","FRI"]}
  ], "logic":"AND"}
- "TSLA 볼밴 하단 이탈 시 알림 (보유 중일 때만)" →
  {"conditions": [
    {"type":"bb_position","operator":"is","value":"BELOW_LOWER"},
    {"type":"holding_status","operator":"is","value":"HELD"}
  ], "logic":"AND"}

## v3 예시 (어닝 캘린더)
- "AAPL 어닝 3일 이내면 알림 (매수 회피용)" →
  {"conditions": [
    {"type":"earnings_within_days","operator":"<=","value":3}
  ], "logic":"AND"}
- "NVDA RSI 30 이하 + 어닝 7일 이상 남았을 때만 진입" →
  {"conditions": [
    {"type":"rsi","operator":"<=","value":30},
    {"type":"earnings_within_days","operator":">=","value":7}
  ], "logic":"AND"}

## v3 예시 (크로스-티커)
- "SPY -2% 이하 하락한 날에는 SOXL 진입 회피 → SOXL 매수 조건에 SPY 안 떨어진 조건 추가"
  ticker: "SOXL", conditions: [
    {"type":"cross_ticker","operator":">","value":-2,"crossTicker":"SPY","metric":"change_percent"}
  ], "logic":"AND"
- "VIX 25 초과 시 QQQ 콜 스캘핑" — ticker: "QQQ", conditions: [
    {"type":"cross_ticker","operator":">","value":25,"crossTicker":"VIX","metric":"price"}
  ]
- "SPY RSI 70 이상 과매수면 QQQ 회피 알림" — ticker: "QQQ", conditions: [
    {"type":"cross_ticker","operator":">=","value":70,"crossTicker":"SPY","metric":"rsi"}
  ]
  * 조건 = 알림 발동 조건. 사용자가 "X 상황이면 알림" 이라고 하면 X 를 그대로 조건으로 씀 (부정하지 않음).
- "SPY MACD 골든크로스 발생 시 SOXL 진입" — ticker: "SOXL", conditions: [
    {"type":"cross_ticker","operator":"==","value":1,"crossTicker":"SPY","metric":"macd_signal"}
  ]
- "VIX SMA 골든크로스 (=변동성 상승 국면) 시 방어형 TLT 매수" — ticker: "TLT", conditions: [
    {"type":"cross_ticker","operator":"==","value":1,"crossTicker":"VIX","metric":"sma_cross"}
  ]
- "SPY 볼밴 상단 이탈 시 QQQ 진입 회피" — ticker: "QQQ", conditions: [
    {"type":"cross_ticker","operator":"==","value":1,"crossTicker":"SPY","metric":"bb_position"}
  ]
- "VIX 20 초과 + SPY 볼밴 하단 이탈 시 SOXL 진입 회피" (AND combo) — ticker: "SOXL", conditions: [
    {"type":"cross_ticker","operator":">","value":20,"crossTicker":"VIX","metric":"price"},
    {"type":"cross_ticker","operator":"==","value":-1,"crossTicker":"SPY","metric":"bb_position"}
  ], "logic":"AND"

## 규칙
- 지원 타입 외 조건 요구되면 { "error": "지원 안함: ..." } 로만 응답
- 뉴스/펀더멘털 조건은 미지원 (지원 타입 외 로 처리). 어닝 / 크로스-티커는 v3 로 지원 시작.
- ticker 알 수 없으면 { "error": "ticker 를 명확히 지정해주세요" }
- 사용자가 시간대를 "미국장" / "한국장" 등으로 지칭하면 KST 로 환산 (미국장 = 대략 22:30~05:00 KST DST 무관 단순화, 한국장 = 09:00~15:30)

## 사용자 입력
`

export interface ParseError {
  error: string
}

export function isParseError(x: unknown): x is ParseError {
  return typeof x === 'object' && x !== null && typeof (x as ParseError).error === 'string'
}

/**
 * 자연어 → ParsedStrategy 파싱.
 * 실패 시 Error throw — 사용자에게 되묻기 유도.
 */
export async function parseStrategyText(text: string): Promise<ParsedStrategy> {
  if (!text || !text.trim()) {
    throw new Error('전략 텍스트를 입력해주세요.')
  }
  if (text.length > 500) {
    throw new Error('전략 텍스트가 너무 깁니다 (500자 이하).')
  }

  const prompt = `${PROMPT_HEADER}\n${text.trim()}`

  // 명시 model='sonnet' — 자연어 → 구조화 JSON 파싱 안정성 우선 (35-A intent='parse'
  // 매핑은 haiku 지만 전략 파서는 스키마 위반 회귀 방지 위해 sonnet 유지 예외).
  const result = await askAdvisor(prompt, {
    model: 'sonnet',
    timeout: 60_000,
    maxBudgetUsd: 0.2,
    caller: 'strategy:parse',
  })

  // 응답에서 JSON 추출 — AI 가 코드블록/서론과 함께 감쌀 수 있음.
  // 첫 { ... 대응하는 마지막 } 사이만 파싱.
  const raw = result.response.trim()
  const firstBrace = raw.indexOf('{')
  const lastBrace = raw.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error(`AI 파싱 응답에 JSON 오브젝트가 없습니다. 표현을 바꿔서 재시도해주세요.\n원문: ${raw.slice(0, 200)}`)
  }
  const cleaned = raw.slice(firstBrace, lastBrace + 1).trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error(`AI 파싱 응답이 JSON 이 아닙니다. 재시도 하거나 표현을 바꿔주세요.\n원문: ${cleaned.slice(0, 200)}`)
  }

  if (isParseError(parsed)) {
    throw new Error(`파싱 실패: ${parsed.error}`)
  }

  if (!validateParsedStrategy(parsed)) {
    throw new Error(`AI 응답이 유효한 전략 스키마가 아닙니다. 예: 'SOXL 이 40달러 이하 되면 매수'`)
  }

  // ticker 대문자 정규화 (parser 프롬프트에도 있지만 방어)
  return { ...parsed, ticker: parsed.ticker.toUpperCase().trim() }
}

/**
 * Phase 35-B (#434) — 자연어 전략 편집.
 * 기존 전략 컨텍스트 + 자연어 지시 → 갱신된 ParsedStrategy 반환. 상대 편집
 * ("SPY 조건 빼줘", "어닝 5일로 완화") 지원. 지원 조건 밖 지시는 error throw.
 */
export async function editStrategyByNL(
  current: ParsedStrategy,
  instruction: string,
): Promise<ParsedStrategy> {
  if (!instruction || !instruction.trim()) {
    throw new Error('편집 지시를 입력해주세요.')
  }
  if (instruction.length > 500) {
    throw new Error('편집 지시가 너무 깁니다 (500자 이하).')
  }

  const contextBlock = JSON.stringify(
    {
      name: current.name,
      ticker: current.ticker,
      conditions: current.conditions,
      logic: current.logic,
      frequency: current.frequency,
    },
    null,
    2,
  )

  const editHeader = `
사용자가 아래 기존 전략을 자연어 지시대로 수정한 결과를 JSON 으로 응답해줘.
반환 스키마는 등록과 동일 (name / ticker / conditions / logic / frequency).
오직 JSON 오브젝트만 출력 — 다른 설명/코드블록 없이.

## 상대 편집 규칙
- "SPY 조건 빼줘" / "어닝 조건 제거" → 해당 type 의 condition 삭제
- "어닝 5일로 완화" / "RSI 25 로 강화" → 해당 condition value 조정
- "OR 로 바꿔" → logic 변경
- "매일 한 번만" / "always 로" → frequency 변경
- "이름을 X 로" → name 변경
- 지시가 애매하면 { "error": "지시 애매: ..." } 로 응답
- 기존 전략에 없는 조건 타입을 새로 요구 → 등록 규칙 그대로 (지원 타입 밖이면 error)

${PROMPT_HEADER}

## 기존 전략 (JSON)
${contextBlock}

## 편집 지시
`

  const prompt = `${editHeader}${instruction.trim()}`

  // 편집도 등록과 동일하게 sonnet 로 (스키마 안정성 우선).
  const result = await askAdvisor(prompt, {
    model: 'sonnet',
    timeout: 60_000,
    maxBudgetUsd: 0.2,
    caller: 'strategy:edit',
  })

  const raw = result.response.trim()
  const firstBrace = raw.indexOf('{')
  const lastBrace = raw.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error(`AI 편집 응답에 JSON 오브젝트가 없습니다. 표현을 바꿔서 재시도해주세요.\n원문: ${raw.slice(0, 200)}`)
  }
  const cleaned = raw.slice(firstBrace, lastBrace + 1).trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error(`AI 편집 응답이 JSON 이 아닙니다. 재시도 하거나 표현을 바꿔주세요.\n원문: ${cleaned.slice(0, 200)}`)
  }

  if (isParseError(parsed)) {
    throw new Error(`편집 실패: ${parsed.error}`)
  }

  if (!validateParsedStrategy(parsed)) {
    throw new Error(`AI 편집 결과가 유효한 전략 스키마가 아닙니다. 지시를 더 명확히 해주세요.`)
  }

  return { ...parsed, ticker: parsed.ticker.toUpperCase().trim() }
}
