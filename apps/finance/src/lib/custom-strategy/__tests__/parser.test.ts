/**
 * Phase 38-A (#448) — parser 프롬프트 문서화 회귀 방지.
 *
 * Codex #457 P2: 스키마 확장 (types.ts 의 CrossTickerMetric) 만으로는 자연어 진입
 * 경로 (parseStrategyText / editStrategyByNL) 가 새 metric 을 생성할 수 없다.
 * AI 프롬프트가 metric 목록·인코딩·예시를 명시해야 사용자가 실제로 활용 가능.
 *
 * PROMPT_HEADER 는 등록/편집 양쪽에서 재사용되므로 여기서 한번 검증하면 두 경로
 * 모두 커버.
 */

import { describe, expect, it } from 'vitest'
import { PROMPT_HEADER } from '../parser'

describe('PROMPT_HEADER — cross_ticker 신규 metric 문서화 (Phase 38-A #448 회귀)', () => {
  it('metric 4종 이름을 모두 언급', () => {
    expect(PROMPT_HEADER).toContain('"rsi"')
    expect(PROMPT_HEADER).toContain('"macd_signal"')
    expect(PROMPT_HEADER).toContain('"sma_cross"')
    expect(PROMPT_HEADER).toContain('"bb_position"')
  })

  it('카테고리컬 metric 은 == operator 만 허용됨을 명시', () => {
    // 3종 모두 "==" 로만 쓸 수 있음을 언급 — AI 가 다른 operator 를 생성하지 않도록.
    expect(PROMPT_HEADER).toContain('operator 는 "==" 만')
  })

  it('정수 인코딩 컨벤션 (1=GOLDEN, 0=NONE/WITHIN, -1=DEAD/BELOW) 명시', () => {
    expect(PROMPT_HEADER).toMatch(/1=GOLDEN/)
    expect(PROMPT_HEADER).toMatch(/-1=DEAD/)
    expect(PROMPT_HEADER).toMatch(/1=ABOVE_UPPER/)
    expect(PROMPT_HEADER).toMatch(/-1=BELOW_LOWER/)
  })

  it('rsi 값 범위 (0~100) 명시', () => {
    expect(PROMPT_HEADER).toContain('0~100')
  })

  it('cross_ticker v3 예시에 각 신규 metric 이 실제 JSON 으로 등장', () => {
    // 예시 없이 목록만 보면 AI 가 필드명을 유추 실패할 수 있음 — 실 JSON 예시 필수.
    expect(PROMPT_HEADER).toMatch(/"metric":"rsi"/)
    expect(PROMPT_HEADER).toMatch(/"metric":"macd_signal"/)
    expect(PROMPT_HEADER).toMatch(/"metric":"sma_cross"/)
    expect(PROMPT_HEADER).toMatch(/"metric":"bb_position"/)
  })

  // Phase 38-B (#449) — 다중 cross_ticker AND combo 예시 등장.
  // "VIX 20 초과 + SPY 볼밴 하단 이탈 시" 처럼 벤치마크 두 개를 AND 로 묶는 케이스는
  // 실무에서 자주 등장하지만 예시가 없으면 AI 가 두 조건으로 분리 실패할 수 있음.
  it('AND combo 예시 (VIX price + SPY bb_position) 노출', () => {
    expect(PROMPT_HEADER).toContain('"crossTicker":"VIX"')
    // combo 예시 안에 두 cross_ticker 가 나란히 있어야 함
    const comboBlock = PROMPT_HEADER.match(/AND combo[\s\S]{0,400}/)
    expect(comboBlock).not.toBeNull()
    expect(comboBlock![0]).toContain('"crossTicker":"VIX"')
    expect(comboBlock![0]).toContain('"crossTicker":"SPY"')
    expect(comboBlock![0]).toContain('"logic":"AND"')
  })

  // Codex #457 P2 회귀 방지 — RSI 예시가 사용자 자연어와 방향 일치해야 함.
  // 조건 = 알림 발동 조건. "SPY RSI 70 이상 과매수면 회피 알림" → operator=`>=`, value=70.
  // 이전에는 `<` 로 잘못 적혀 저장 시 반대 상황 (RSI 70 미만) 에서 알림 발동됐음.
  it('RSI 크로스 티커 예시가 "이상 과매수" 자연어와 일치하는 operator 사용 (>= 아닌 <)', () => {
    // RSI 예시 JSON 전체를 추출 — "metric":"rsi" 를 포함하는 최소 { ... } 블록.
    // v1 예시의 `{"type":"rsi","operator":"<=","value":30}` 는 metric 필드가 없으므로
    // 매칭되지 않음 → cross_ticker 예시만 선택됨.
    const rsiExampleMatch = PROMPT_HEADER.match(/\{[^{}]*"metric":"rsi"[^{}]*\}/)
    expect(rsiExampleMatch).not.toBeNull()
    const rsiExample = rsiExampleMatch![0]
    // ">=" 여야 함 (사용자 "이상" 표현과 일치). "<" 이면 방향 반전 회귀.
    expect(rsiExample).toContain('"operator":">="')
    expect(rsiExample).not.toContain('"operator":"<"')
  })
})
