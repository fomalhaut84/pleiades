/**
 * pleiades#279 — AI 뉴스 검색·인용 공통 규칙.
 *
 * WebSearch 결과에는 기사 게시일이 없다 — 도구가 넘기는 것은 링크 목록(제목은 대부분 도메인)과
 * 검색 쪽 모델의 요약문뿐이고, 순서는 관련도라 몇 해 전 기사가 섞인다 (2026-10-26 로컬 실측).
 * 프롬프트가 날짜를 확인시키지 않으면 옛 기사를 "최신 뉴스" 로 인용한다. 이 규칙은 클로징 리뷰(fin#501)에만
 * 있던 것을 모든 뉴스 경로(시스템 프롬프트 · 브리핑 · 종목 분석 · 클로징 · 주간 리뷰)에 같은 문구로 넣는다.
 */

import { KST_OFFSET_MS, formatKstDate } from '@/lib/kst-date'

/** 인용할 기사의 최대 나이(일). 브리핑·리뷰는 그날 시장, 분석·채팅은 종목 흐름이라 넓게 */
export const NEWS_MAX_AGE_DAYS = { briefing: 7, analysis: 30 } as const

/**
 * 날짜 확인용 WebFetch 상한(건). 기사마다 열면 턴·시간이 기사 수에 비례해 늘고, 브리핑(300 s)·채팅(180 s)은
 * 시간 초과를 재시도하지 않는다 (#279 사전 리뷰 major)
 */
export const NEWS_FETCH_LIMIT = { briefing: 6, analysis: 4 } as const

const DAY_MS = 24 * 60 * 60 * 1000

export type NewsScope = keyof typeof NEWS_MAX_AGE_DAYS

/** KST 기준 `YYYY년 M월` — 검색 질의에 붙일 연·월. pure */
export function kstYearMonth(now: Date): string {
  const s = new Date(now.getTime() + KST_OFFSET_MS)
  return `${s.getUTCFullYear()}년 ${s.getUTCMonth() + 1}월`
}

/**
 * 인용 기간이 걸치는 KST 연·월 목록 (오래된 달 먼저). pure.
 * 질의에 이번 달만 넣으면 월초에 지난달 기사가 안 잡힌다 (#279 사전 리뷰 major — 11-01 의 30일 = 10월).
 */
export function kstSearchMonths(now: Date, days: number): string[] {
  const from = kstYearMonth(new Date(now.getTime() - days * DAY_MS))
  const to = kstYearMonth(now)
  return from === to ? [to] : [from, to]
}

export interface NewsRuleOptions {
  /** 기간 안 기사가 없을 때 쓰는 문구 — 클로징 리뷰는 "당일 뉴스 미확인" (기존 표기와 한 벌로) */
  missingLabel?: string
}

/**
 * 뉴스 검색·인용 규칙 줄 목록. pure.
 * `now` 를 넘기면 오늘 날짜·연월을 박는다 (작업 프롬프트). 생략하면 날짜 없는 문구 (정적 시스템 프롬프트 —
 * 오늘 날짜는 CLI 가 실행 환경으로 넣는다).
 */
export function newsSearchRules(scope: NewsScope, now?: Date, options: NewsRuleOptions = {}): string[] {
  const days = NEWS_MAX_AGE_DAYS[scope]
  const fetchLimit = NEWS_FETCH_LIMIT[scope]
  const missingLabel = options.missingLabel ?? '최근 뉴스 미확인'
  const today = now ? formatKstDate(now) : null
  const todayRef = today ? `${today} (KST)` : '실행 환경의 오늘 날짜 (KST)'
  const months = now
    ? kstSearchMonths(now, days).map((m) => `"${m}"`).join(' 또는 ')
    : `"YYYY년 M월" 형식의 연·월(최근 ${days}일이 지난달에 걸치면 지난달도)`
  return [
    '뉴스 검색·인용 규칙 (WebSearch 결과에는 기사 게시일이 없고, 몇 해 전 기사가 섞인다):',
    `- 오늘은 ${todayRef} 다. "최신" 은 이 날짜 기준이다`,
    `- 검색 질의에는 회사 한글명(미국 종목은 영문 회사명)과 ${months} 를 넣는다. 티커 코드(예: 000660.KS)만으로 검색하지 않는다`,
    `- 뉴스·이슈는 게시일이 확인된 기사만 인용한다 — 오늘 기준 최근 ${days}일 이내. 검색 결과·요약에 날짜가 없으면 WebFetch 로 기사 본문을 열어 확인하되, 인용할 기사에 한해 최대 ${fetchLimit}건만 연다. 그래도 날짜를 모르면 인용하지 않는다`,
    `- 인용하는 기사마다 게시일을 (YYYY-MM-DD) 로 붙인다. 기간 안 기사가 없으면 "${missingLabel}" 이라고 쓰고, 옛 기사로 채우지 않는다`,
    '- 예정 이벤트(FOMC · 실적 발표 · 지표 발표 · 주총 등 일정)는 게시일이 아니라 이벤트 날짜와 출처를 확인해 쓴다 — 캘린더·공시 페이지는 게시일이 없어도 된다',
    '- 검색 요약문에 나온 주가·지수·실적 수치는 날짜가 확인된 기사의 것만 쓴다. 현재 시세·지수·환율은 get_prices / get_fx_rate 도구값만 쓴다',
  ]
}
