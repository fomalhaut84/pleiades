import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { toDiscordMarkdown } from '@pleiades/notify'
import { buildGuidePrompt, buildTaSignalMessage, selectAiGuideTargets, TA_GUIDE_BUDGET_USD } from '../ta-signal-alert'
import { formatPrice, guideLines, metricLines, suggestedPrompt, type TaMetrics } from '../ta-signal-format'
import type { TAReport } from '@/lib/ta/types'

const COOLDOWN = 6 * 60 * 60 * 1000

describe('selectAiGuideTargets', () => {
  const A = { ticker: 'AAA' }
  const B = { ticker: 'BBB' }
  const C = { ticker: 'CCC' }
  const D = { ticker: 'DDD' }
  const NOW = 1_700_000_000_000

  it('빈 map + 후보 4 → topN 3 로 잘림', () => {
    const result = selectAiGuideTargets([A, B, C, D], new Map(), NOW, COOLDOWN, 3)
    expect(result).toEqual([A, B, C])
  })

  it('쿨다운 중인 티커는 제외', () => {
    const last = new Map<string, number>([
      [A.ticker, NOW - 1000], // just now → cooling
      [B.ticker, NOW - COOLDOWN + 1], // still cooling
    ])
    const result = selectAiGuideTargets([A, B, C, D], last, NOW, COOLDOWN, 3)
    expect(result).toEqual([C, D])
  })

  it('쿨다운 만료된 티커는 재포함', () => {
    const last = new Map<string, number>([
      [A.ticker, NOW - COOLDOWN], // 정확히 경계 → 재포함 (>=)
      [B.ticker, NOW - COOLDOWN - 1000], // 오래된 → 재포함
    ])
    const result = selectAiGuideTargets([A, B, C], last, NOW, COOLDOWN, 3)
    expect(result).toEqual([A, B, C])
  })

  it('쿨다운 스킵 후 topN 슬롯 낭비 없음', () => {
    // A 는 쿨다운, B/C/D 는 통과 → topN=3 슬롯 낭비 없이 B,C,D 반환
    const last = new Map<string, number>([[A.ticker, NOW - 1]])
    const result = selectAiGuideTargets([A, B, C, D], last, NOW, COOLDOWN, 3)
    expect(result).toEqual([B, C, D])
  })

  it('topN=0 → 빈 배열', () => {
    const result = selectAiGuideTargets([A, B], new Map(), NOW, COOLDOWN, 0)
    expect(result).toEqual([])
  })

  it('candidates 빈 → 빈 배열', () => {
    const result = selectAiGuideTargets([], new Map(), NOW, COOLDOWN, 3)
    expect(result).toEqual([])
  })
})

// 회귀: pleiades#269 — $0.10 은 컨텍스트만으로 닿았다(#247 · 1시간 캐시 쓰기 2배 단가). 사용자 결정 $0.25
describe('TA 가이드 예산', () => {
  it('$0.25 상수를 askAdvisor 에 넘긴다', () => {
    expect(TA_GUIDE_BUDGET_USD).toBe(0.25)
    const src = readFileSync(path.resolve(__dirname, '../ta-signal-alert.ts'), 'utf-8')
    expect(src).toMatch(/maxBudgetUsd:\s*TA_GUIDE_BUDGET_USD,\s*intent:\s*'guide'/)
    expect(src).not.toMatch(/maxBudgetUsd:\s*0\.10/)
  })
})


// 013 F5 (#785) · #820 — 틀은 Discord 마크다운 · 템플릿 글은 escape · 현재가 · 지표 줄 · AI 2줄 · !ai 추천 질문
describe('buildTaSignalMessage', () => {
  const r = (over: Record<string, unknown> = {}) => ({
    ticker: '005930.KS', displayName: '삼성전자', strategy: 'swing/momentum', signals: ['🟢 RSI 과매도 (28.3)'], signalIds: ['RSI_OVERSOLD'], ...over,
  })
  const ASK = '`!ai 삼성전자(005930.KS) RSI 과매도 시그널이 나왔어. 지금 진입해도 될지, 진입가·손절가·분할 매수 계획을 알려줘`'

  it('제목 · 종목 줄 굵게 · 전략 한글 · 가이드 없으면 💡 없음 · 추천 질문은 늘', () => {
    expect(buildTaSignalMessage([r()], new Map())).toBe(
      `📊 **TA 시그널 알림**\n\n**삼성전자** (005930.KS) — 스윙/모멘텀\n  🟢 RSI 과매도 (28.3)\n  🔎 자세히: ${ASK}\n`,
    )
  })

  it('현재가(등락률)를 종목 줄에 · 이름 = 티커면 괄호 생략', () => {
    const msg = buildTaSignalMessage(
      [r({ ticker: 'SOXL', displayName: 'SOXL', strategy: 'swing', quote: { price: 18.4, changePercent: -3.12, currency: 'USD' } })],
      new Map(),
    )
    expect(msg).toContain('**SOXL** — 스윙 · $18.40 (-3.1%)\n')
    expect(msg).not.toContain('(SOXL)')
    const kr = buildTaSignalMessage([r({ quote: { price: 71200, changePercent: 1.24, currency: 'KRW' } })], new Map())
    expect(kr).toContain('**삼성전자** (005930.KS) — 스윙/모멘텀 · 71,200원 (+1.2%)\n')
    const noPct = buildTaSignalMessage([r({ quote: { price: 71200, changePercent: null, currency: 'KRW' } })], new Map())
    expect(noPct).toContain('— 스윙/모멘텀 · 71,200원\n')
  })

  it('지표 줄 — 숫자는 코드가 · 가이드보다 위', () => {
    const metrics: TaMetrics = { change5d: -25.8, change20d: -52.63, fromHigh52w: -61, rsi: 34.4, volumeRatio: 0.42, bbPosition: 'NEAR_LOWER' }
    const msg = buildTaSignalMessage([r({ metrics })], new Map([['005930.KS', '소량 진입\n거래량 회복 확인']]))
    expect(msg).toContain('  📏 5일 -25.8% · 20일 -52.6% · 52주 고점 대비 -61.0%\n  📊 RSI 34.4 · 거래량 0.4배(20일 평균 대비) · BB 하단 근접\n  💡 소량 진입\n  　  거래량 회복 확인\n  🔎')
  })

  it('HTML 태그를 쓰지 않는다', () => {
    expect(buildTaSignalMessage([r()], new Map([['005930.KS', '가이드']]))).not.toMatch(/<\/?b>/)
  })

  it('종목명 · 티커 · 시그널 글의 마크다운 기호는 escape', () => {
    const msg = buildTaSignalMessage([r({ displayName: 'A*B_C', signals: ['# 제목 아님', '~~취소~~'] })], new Map())
    expect(msg).toContain('**A\\*B\\_C**')
    expect(msg).toContain('  \\# 제목 아님')
    expect(msg).toContain('\\~\\~취소\\~\\~')
  })

  // 회귀: 2026-11-19 SOXL — 모델이 보고서(제목 · 구분선 · 라벨 · 목록)를 내 한 줄로 접히고 300자에서 잘렸다
  it('보고서형 가이드는 제목 · 구분선 · 라벨 줄을 버리고 첫 2줄만', () => {
    const guide = '## 📊 SOXL MACD 골든크로스 — 1~2줄 가이드\n\n**1주 소량 진입** 후 거래량 회복 대기 권장.\n---\n현재 상황 요약:\n- 🔴 거래량: 0.4배\n- 🔴 변동성: 극단적'
    expect(guideLines(guide)).toEqual(['**1주 소량 진입** 후 거래량 회복 대기 권장.', '🔴 거래량: 0.4배'])
    const msg = buildTaSignalMessage([r()], new Map([['005930.KS', guide]]))
    expect(msg).toContain('  💡 **1주 소량 진입** 후 거래량 회복 대기 권장.\n  　  🔴 거래량: 0.4배\n')
    expect(msg).not.toContain('---')
    expect(msg).not.toContain('변동성')
  })

  // 회귀: #820 9-1 major — 끝이 서식 기호인 라벨 줄(`**결론:**`)이 2줄 중 한 칸을 차지했다
  it('굵게 · 밑줄로 감싼 라벨 줄과 표 줄도 버린다', () => {
    expect(guideLines('**결론:**\n관망\n__근거:__\n| a | b |\n|---|---|\n근거')).toEqual(['관망', '근거'])
  })

  it('가이드 줄은 120자(넘으면 …) · 이모지를 반으로 가르지 않는다', () => {
    expect(guideLines('x'.repeat(200))).toEqual([`${'x'.repeat(120)}…`])
    const [line] = guideLines(`${'x'.repeat(119)}📈📈`)
    expect(line).toBe(`${'x'.repeat(119)}📈…`)
    expect(line).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)
  })

  it('정리기를 거친 뒤에도 가이드가 줄 머리 서식(제목 · 목록 · 인용)이 되지 않는다', () => {
    const out = toDiscordMarkdown(buildTaSignalMessage([r()], new Map([['005930.KS', '> 인용\n- # 제목\n1. 번호']])), 'markdown')
    for (const line of out.split('\n')) expect(line).not.toMatch(/^\s*(#{1,3} |> |- |\d+\. )/)
  })

  // 회귀: #785 9-1 major — 짝 없는 인라인 기호가 빈 줄을 넘어 다음 종목 틀과 짝을 맺었다
  it('120자 경계에서 갈라진 ** 는 escape — 다음 종목 굵게와 짝을 맺지 않는다', () => {
    const msg = buildTaSignalMessage(
      [r(), r({ ticker: 'AAPL', displayName: 'Apple' })],
      new Map([['005930.KS', `${'x'.repeat(116)}**관망 권고**`]]),
    )
    expect(msg).toContain(`💡 ${'x'.repeat(116)}\\*\\*관망…\n`)
    expect(msg).toContain('\n**Apple** (AAPL)')
  })

  it('가이드의 || · 백틱은 escape — 틀이 스포일러 · 코드로 가려지지 않는다', () => {
    const msg = buildTaSignalMessage([r()], new Map([['005930.KS', 'a || b ```']]))
    expect(msg).toContain('💡 a \\|\\| b \\`\\`\\`')
  })

  it('종목 여러 개는 빈 줄로 가른다', () => {
    const msg = buildTaSignalMessage([r(), r({ ticker: 'AAPL', displayName: 'Apple', strategy: 'long_hold', signals: ['a'], signalIds: [] })], new Map())
    expect(msg).toContain(`${ASK}\n\n**Apple** (AAPL) — 장기\n  a\n  🔎 자세히: \`!ai Apple(AAPL) 지금 어떻게 대응할지 알려줘\`\n`)
  })
})

describe('suggestedPrompt', () => {
  it('방향 — 매수 · 매도 · 섞임', () => {
    expect(suggestedPrompt({ ticker: 'SOXL', displayName: 'SOXL', signalIds: ['MACD_GOLDEN'] }))
      .toBe('!ai SOXL MACD 골든크로스 시그널이 나왔어. 지금 진입해도 될지, 진입가·손절가·분할 매수 계획을 알려줘')
    expect(suggestedPrompt({ ticker: 'SOXL', displayName: 'SOXL', signalIds: ['MACD_DEAD', 'RSI_OVERBOUGHT'] }))
      .toContain('MACD 데드크로스·RSI 과매수 시그널이 나왔어. 지금 매도(비중 축소)할지')
    expect(suggestedPrompt({ ticker: 'SOXL', displayName: 'SOXL', signalIds: ['RSI_OVERSOLD', 'MACD_DEAD'] }))
      .toContain('매수·매도 시그널이 함께 나왔는데')
  })

  it('인라인 코드를 깨거나 멘션 · 링크가 될 글자는 뺀다', () => {
    const p = suggestedPrompt({ ticker: 'X', displayName: 'a`b<@1>[c](d)\ne', signalIds: [] })
    expect(p).not.toMatch(/[`<>[\]\n]/)
  })
})

describe('formatPrice · metricLines', () => {
  it('통화별 표기', () => {
    expect(formatPrice(1234.5, 'USD')).toBe('$1,234.50')
    expect(formatPrice(71200.4, 'KRW')).toBe('71,200원')
    expect(formatPrice(10, 'JPY')).toBe('10.00 JPY')
  })

  it('숫자가 아니면 그 항목만 뺀다 · 0 은 부호 없이', () => {
    const lines = metricLines({ change5d: Number.NaN, change20d: 0, fromHigh52w: -0.01, rsi: 50, volumeRatio: 1, bbPosition: 'MIDDLE' })
    expect(lines[0]).toBe('📏 20일 0.0% · 52주 고점 대비 0.0%')
  })
})

describe('buildGuidePrompt', () => {
  const report = {
    price: { current: 18.4, change1d: -3, change5d: -25.8, change20d: -52.6, high52w: 50, low52w: 10, fromHigh52w: -61 },
    indicators: {
      rsi14: { value: 34.4, signal: 'NEUTRAL' },
      macd: { macd: 0, signal: 0, histogram: 0, trend: 'NEUTRAL', crossover: 'GOLDEN' },
      bollingerBands: { upper: 0, middle: 0, lower: 0, position: 'NEAR_LOWER', bandwidth: 0 },
      sma: { sma20: 0, sma50: 0, sma200: null, priceVsSma20: 0 },
      volume: { current: 0, avg20d: 0, ratio: 0.42, surge: false },
    },
  } as unknown as TAReport

  it('형식을 고정하고 지표 숫자를 넘긴다', () => {
    const p = buildGuidePrompt({ ticker: 'SOXL', displayName: 'SOXL', signals: ['🔄 MACD 골든크로스 — 매수 시그널'], report })
    expect(p).toContain('평문 정확히 2줄')
    expect(p).toContain('제목 · 목록 · 구분선 · 표')
    expect(p).toContain('RSI 34.4')
    expect(p).toContain('거래량 20일 평균 대비 0.4배')
    expect(p).toContain('볼린저 밴드 하단 근접')
    expect(p).not.toContain('NEAR_LOWER')
  })

  it('숫자가 아닌 지표는 빼고 넘긴다', () => {
    const bad = { ...report, indicators: { ...report.indicators, volume: { ...report.indicators.volume, ratio: Number.POSITIVE_INFINITY } } } as TAReport
    const p = buildGuidePrompt({ ticker: 'SOXL', displayName: 'SOXL', signals: ['x'], report: bad })
    expect(p).not.toMatch(/Infinity|NaN/)
    expect(p).toContain('RSI 34.4')
  })
})
