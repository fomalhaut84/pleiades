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

export type NewsScope = keyof typeof NEWS_MAX_AGE_DAYS

/** KST 기준 `YYYY년 M월` — 검색 질의에 붙일 연·월. pure */
export function kstYearMonth(now: Date): string {
  const s = new Date(now.getTime() + KST_OFFSET_MS)
  return `${s.getUTCFullYear()}년 ${s.getUTCMonth() + 1}월`
}

/**
 * 뉴스 검색·인용 규칙 줄 목록. pure.
 * `now` 를 넘기면 오늘 날짜·연월을 박는다 (작업 프롬프트). 생략하면 날짜 없는 문구 (정적 시스템 프롬프트 —
 * 오늘 날짜는 CLI 가 실행 환경으로 넣는다).
 */
export function newsSearchRules(scope: NewsScope, now?: Date): string[] {
  const days = NEWS_MAX_AGE_DAYS[scope]
  const today = now ? formatKstDate(now) : null
  const todayRef = today ? `${today} (KST)` : '실행 환경의 오늘 날짜 (KST)'
  const yearMonth = now ? `"${kstYearMonth(now)}"` : '"YYYY년 M월" 형식의 현재'
  return [
    '뉴스 검색·인용 규칙 (WebSearch 결과에는 기사 게시일이 없고, 몇 해 전 기사가 섞인다):',
    `- 오늘은 ${todayRef} 다. "최신" 은 이 날짜 기준이다`,
    `- 검색 질의에는 회사 한글명(미국 종목은 영문 회사명)과 ${yearMonth} 연·월을 넣는다. 티커 코드(예: 000660.KS)만으로 검색하지 않는다`,
    `- 게시일이 확인된 기사만 인용한다 — 오늘 기준 최근 ${days}일 이내. 검색 결과·요약에 날짜가 없으면 WebFetch 로 기사 본문을 열어 날짜를 확인하고, 그래도 모르면 인용하지 않는다`,
    '- 인용하는 기사마다 게시일을 (YYYY-MM-DD) 로 붙인다. 기간 안 기사가 없으면 "최근 뉴스 미확인" 이라고 쓰고, 옛 기사로 채우지 않는다',
    '- 검색 요약문에 나온 주가·지수·실적 수치는 날짜가 확인된 기사의 것만 쓴다. 현재 시세·지수·환율은 get_prices / get_fx_rate 도구값만 쓴다',
  ]
}
