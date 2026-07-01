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

const PROMPT_HEADER = `
사용자 입력을 아래 JSON schema 로 정확히 파싱해줘. 오직 JSON 오브젝트만 출력 — 다른 설명/코드블록 없이.

## 지원 조건 타입
- price (숫자, ticker 현재가)
- rsi (숫자, RSI14 값)
- macd_signal (문자열, "GOLDEN" 또는 "DEAD")
- sma_cross (문자열, "GOLDEN" 또는 "DEAD")
- bb_position (문자열, "BELOW_LOWER" 또는 "ABOVE_UPPER")
- change_pct (숫자, timeframe 필수 — "1d" | "5d" | "20d")

## 연산자
- 숫자 타입: < <= > >= ==
- 문자열 타입: is (전용)

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

## 규칙
- 지원 타입 외 조건 요구되면 { "error": "지원 안함: ..." } 로만 응답
- 뉴스/펀더멘털/시간 조건은 미지원
- ticker 알 수 없으면 { "error": "ticker 를 명확히 지정해주세요" }

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

  const result = await askAdvisor(prompt, {
    model: 'sonnet',
    timeout: 60_000,
    maxBudgetUsd: 0.2,
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
