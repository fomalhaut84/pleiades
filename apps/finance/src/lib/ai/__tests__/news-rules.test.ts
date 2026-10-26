/**
 * 회귀: pleiades#279 — WebSearch 결과에는 기사 게시일이 없어 옛 기사가 "최신 뉴스" 로 인용됐다.
 * 날짜·최신성 규칙이 클로징 리뷰(fin#501)에만 있었다 → 모든 뉴스 경로에 같은 공통 규칙.
 */

import { describe, expect, it, vi } from 'vitest'

// 봇·DB·CLI 모듈을 실제로 로드하지 않는다 (active-review.test.ts 와 같은 방식 · #279 사전 리뷰 info)
vi.mock('@/bot/index', () => ({ getBot: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/ai/claude-advisor', () => ({ askAdvisor: vi.fn(), AdvisorError: class extends Error {}, describeAdvisorError: vi.fn() }))

import { kstSearchMonths, kstYearMonth, NEWS_FETCH_LIMIT, NEWS_MAX_AGE_DAYS, newsSearchRules } from '../news-rules'
import { SYSTEM_PROMPT } from '../system-prompt'
import { buildBriefingPrompt } from '@/bot/notifications/briefing'
import { buildTickerAnalysisPrompt } from '@/bot/commands/briefing'
import { buildClosingPrompt, buildWeeklyPrompt } from '@/bot/notifications/active-review'

// 2026-10-31 23:30 UTC = 2026-11-01 08:30 KST — 월 경계에서 KST 기준인지 본다
const NOW = new Date('2026-10-31T23:30:00Z')

describe('kstYearMonth', () => {
  it('KST 기준 연·월', () => {
    expect(kstYearMonth(NOW)).toBe('2026년 11월')
    expect(kstYearMonth(new Date('2026-10-26T03:00:00Z'))).toBe('2026년 10월')
  })
})

// 회귀: #279 사전 리뷰 major — 이번 달만 넣으면 월초에 지난달 기사가 안 잡힌다
describe('kstSearchMonths', () => {
  it('기간이 지난달에 걸치면 두 달', () => {
    expect(kstSearchMonths(NOW, 30)).toEqual(['2026년 10월', '2026년 11월'])
    expect(kstSearchMonths(NOW, 7)).toEqual(['2026년 10월', '2026년 11월'])
  })

  // 회귀: PR #282 Codex P2 — 2월을 사이에 둔 30일(1/30~3/1 KST)에서 2월이 빠졌다
  it('사이 달까지 모두 — 2월 경계', () => {
    expect(kstSearchMonths(new Date('2027-02-28T15:30:00Z'), 30)).toEqual(['2027년 1월', '2027년 2월', '2027년 3월'])
  })

  it('연말을 넘는다', () => {
    expect(kstSearchMonths(new Date('2027-01-01T00:00:00Z'), 30)).toEqual(['2026년 12월', '2027년 1월'])
  })

  it('한 달 안이면 한 달', () => {
    expect(kstSearchMonths(new Date('2026-10-26T03:00:00Z'), 7)).toEqual(['2026년 10월'])
  })
})

describe('newsSearchRules', () => {
  it('오늘 날짜 · 연월 질의 · 기간 · 게시일 확인 · 날짜 표기 · 도구 시세를 담는다', () => {
    const text = newsSearchRules('briefing', NOW).join('\n')
    expect(text).toContain('2026-11-01 (KST)')
    expect(text).toContain('"2026년 10월" 또는 "2026년 11월"')
    expect(text).toContain(`최근 ${NEWS_MAX_AGE_DAYS.briefing}일 이내`)
    expect(text).toContain('WebFetch')
    expect(text).toContain('(YYYY-MM-DD)')
    expect(text).toContain('티커 코드')
    expect(text).toContain('get_prices')
  })

  // 회귀: #279 사전 리뷰 major — 기사마다 WebFetch 하면 턴·시간이 기사 수에 비례
  it('날짜 확인 WebFetch 상한을 둔다', () => {
    expect(newsSearchRules('briefing', NOW).join('\n')).toContain(`최대 ${NEWS_FETCH_LIMIT.briefing}건`)
    expect(newsSearchRules('analysis', NOW).join('\n')).toContain(`최대 ${NEWS_FETCH_LIMIT.analysis}건`)
  })

  // 회귀: #279 사전 리뷰 major — 게시일 규칙이 FOMC·실적 일정(캘린더 페이지)까지 막았다
  it('예정 이벤트는 게시일 대신 이벤트 날짜·출처', () => {
    const text = newsSearchRules('briefing', NOW).join('\n')
    expect(text).toContain('예정 이벤트')
    expect(text).toContain('이벤트 날짜와 출처')
  })

  it('기간 안 기사 없음 문구는 바꿀 수 있다 — 클로징은 "당일 뉴스 미확인" 한 벌', () => {
    expect(newsSearchRules('briefing', NOW).join('\n')).toContain('"최근 뉴스 미확인"')
    expect(newsSearchRules('briefing', NOW, { missingLabel: '당일 뉴스 미확인' }).join('\n')).not.toContain('최근 뉴스 미확인')
  })

  it('분석은 30일 · 브리핑은 7일', () => {
    expect(newsSearchRules('analysis', NOW).join('\n')).toContain('최근 30일 이내')
    expect(newsSearchRules('briefing', NOW).join('\n')).toContain('최근 7일 이내')
  })

  it('날짜 없이 부르면 고정 날짜를 박지 않는다 (정적 시스템 프롬프트용)', () => {
    const text = newsSearchRules('analysis').join('\n')
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(text).not.toMatch(/\d{4}년 \d+월/)
    expect(text).toContain('실행 환경의 오늘 날짜')
  })
})

describe('뉴스 경로마다 공통 규칙이 들어간다', () => {
  const marker = '게시일이 확인된 기사만 인용한다'

  it('시스템 프롬프트 (채팅 · 자유 질문)', () => {
    expect(SYSTEM_PROMPT).toContain('## 뉴스 검색·인용 규칙')
    expect(SYSTEM_PROMPT).toContain(marker)
    expect(SYSTEM_PROMPT).not.toContain('${')
  })

  it('모닝 브리핑 — 오늘 날짜 · 규칙', () => {
    for (const s of ['KR', 'US'] as const) {
      const p = buildBriefingPrompt(s, NOW)
      expect(p).toContain('(오늘: 2026-11-01 KST 기준)')
      expect(p).toContain(marker)
      expect(p).not.toContain('최신 뉴스 검색')
    }
  })

  it('종목 분석 — 티커 코드만으로 검색하지 않는다', () => {
    const p = buildTickerAnalysisPrompt('000660.KS', NOW)
    expect(p).toContain('(오늘: 2026-11-01 KST 기준)')
    expect(p).not.toContain('"000660.KS 최신 뉴스"')
    expect(p).toContain('"2026년 10월" 또는 "2026년 11월"')
    expect(p).toContain(marker)
  })

  it('클로징 리뷰 — 기존 표기 규칙 유지 + 공통 규칙', () => {
    for (const s of ['KR', 'US'] as const) {
      const p = buildClosingPrompt(s, NOW)
      expect(p).toContain('날짜가 불확실하면 인용하지 말 것')
      expect(p).toContain(marker)
      expect(p).not.toContain('최근 뉴스 미확인')
    }
  })

  it('주간 리뷰 — 오늘 날짜 · 규칙', () => {
    const p = buildWeeklyPrompt(NOW)
    expect(p).toContain('(오늘: 2026-11-01 KST 기준)')
    expect(p).toContain(marker)
    expect(p).toContain('이벤트 날짜와 출처')
  })
})
