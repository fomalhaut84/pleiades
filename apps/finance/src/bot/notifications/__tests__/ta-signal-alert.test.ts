import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { toDiscordMarkdown } from '@pleiades/notify'
import { buildTaSignalMessage, selectAiGuideTargets, TA_GUIDE_BUDGET_USD } from '../ta-signal-alert'

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


// 013 F5 (#785) — 틀은 Discord 마크다운 · 템플릿 글은 escape · AI 가이드는 한 줄로 접어 💡 뒤에
describe('buildTaSignalMessage', () => {
  const r = (over: Partial<{ ticker: string; displayName: string; strategy: string; signals: string[] }> = {}) => ({
    ticker: '005930.KS', displayName: '삼성전자', strategy: 'swing/momentum', signals: ['🟢 RSI 과매도 (28.3)'], ...over,
  })

  it('제목 · 종목 줄은 굵게 · 전략은 한글 · 가이드 없으면 💡 줄 없음', () => {
    expect(buildTaSignalMessage([r()], new Map())).toBe(
      '📊 **TA 시그널 알림**\n\n**삼성전자** (005930.KS) — 스윙/모멘텀\n  🟢 RSI 과매도 (28.3)\n',
    )
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

  it('AI 가이드는 300자 · 줄바꿈을 한 줄로 접어 💡 뒤에 · AI 서식은 남긴다', () => {
    const guide = '**관망** 권고\n# 손절 라인\n- 50일선'
    const msg = buildTaSignalMessage([r()], new Map([['005930.KS', guide]]))
    expect(msg).toContain('\n\n  💡 **관망** 권고 # 손절 라인 - 50일선\n')
    const long = buildTaSignalMessage([r()], new Map([['005930.KS', 'x'.repeat(500)]]))
    expect(long).toContain(`💡 ${'x'.repeat(300)}\n`)
    expect(long).not.toContain('x'.repeat(301))
  })

  it('정리기를 거친 뒤에도 가이드가 줄 머리 서식(제목 · 목록)이 되지 않는다', () => {
    const out = toDiscordMarkdown(buildTaSignalMessage([r()], new Map([['005930.KS', 'a\n## 제목\n> 인용']])), 'markdown')
    for (const line of out.split('\n')) expect(line).not.toMatch(/^\s*(#{1,3} |> )/)
  })

  it('종목 여러 개는 빈 줄로 가른다', () => {
    const msg = buildTaSignalMessage([r(), r({ ticker: 'AAPL', displayName: 'Apple', strategy: 'long_hold', signals: ['a', 'b'] })], new Map())
    expect(msg).toBe('📊 **TA 시그널 알림**\n\n**삼성전자** (005930.KS) — 스윙/모멘텀\n  🟢 RSI 과매도 (28.3)\n\n**Apple** (AAPL) — 장기\n  a\n  b\n')
  })
})
