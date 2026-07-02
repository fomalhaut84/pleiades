/**
 * AlertConfig 카테고리 매핑 (Phase 31-B).
 *
 * DB 스키마 변경 없이 서버 코드 상수로 category 를 부여.
 * `ALERT_KEY_CATEGORY` 에 없는 키는 자동으로 `general` 로 분류 (fallback).
 *
 * 신규 알림 키 추가 시:
 *   1. `ensure*Setting` upsert 호출
 *   2. 여기 매핑에 category 추가
 *   3. 필요 시 `INPUT_TYPE` 오버라이드 (기본은 문자열 인식으로 자동 판정)
 */

export type AlertCategoryKey = 'price' | 'expense' | 'schedule' | 'ai' | 'general'

export interface AlertCategory {
  key: AlertCategoryKey
  label: string
  description: string
  icon: string
  color: 'sejin' | 'sodam' | 'dasom' | 'amber' | 'sub'
  pageLink?: { href: string; label: string }
}

export const ALERT_CATEGORIES: AlertCategory[] = [
  {
    key: 'price',
    label: '가격 / 환율 알림',
    description: '종목 급등락 및 원/달러 환율 변동 임계값',
    icon: '📉',
    color: 'sejin',
  },
  {
    key: 'expense',
    label: '가계부',
    description: '예산 초과 경고 임계값',
    icon: '💸',
    color: 'dasom',
    pageLink: { href: '/budgets', label: '예산 페이지' },
  },
  {
    key: 'schedule',
    label: '발송 스케줄',
    description: '자동 발송 시각 / 주기',
    icon: '🕰️',
    color: 'sodam',
  },
  {
    key: 'ai',
    label: 'AI & 전략 알림',
    description: '기술적 분석 · 능동 AI 리뷰 · 커스텀 전략',
    icon: '🧠',
    color: 'amber',
    pageLink: { href: '/strategies', label: '전략 페이지' },
  },
  {
    key: 'general',
    label: '기타',
    description: '분류되지 않은 알림/설정',
    icon: '⚙️',
    color: 'sub',
  },
]

/** 알려진 키의 카테고리. 여기에 없는 키는 `general` 로 fallback. */
export const ALERT_KEY_CATEGORY: Record<string, AlertCategoryKey> = {
  price_drop_pct: 'price',
  price_surge_pct: 'price',
  fx_change_krw: 'price',
  budget_warn_pct: 'expense',
  daily_summary_hour: 'schedule',
  monthly_report_day: 'schedule',
  ta_check_interval_min: 'ai',
  ta_ai_guide: 'ai',
  active_review: 'ai',
  custom_strategy_alerts: 'ai',
}

export type AlertInputType = 'toggle' | 'percent' | 'currency_krw' | 'hour' | 'day' | 'minutes' | 'integer' | 'text'

/** 키별 입력 타입 오버라이드 (없으면 값 형태 추론) */
export const ALERT_KEY_INPUT_TYPE: Record<string, AlertInputType> = {
  price_drop_pct: 'percent',
  price_surge_pct: 'percent',
  budget_warn_pct: 'percent',
  fx_change_krw: 'currency_krw',
  daily_summary_hour: 'hour',
  monthly_report_day: 'day',
  ta_check_interval_min: 'minutes',
  ta_ai_guide: 'toggle',
  active_review: 'toggle',
  custom_strategy_alerts: 'toggle',
}

/** 키별 사용자 향 설명 (label 은 DB label, 이건 부가 설명) */
export const ALERT_KEY_DESCRIPTION: Record<string, string> = {
  price_drop_pct: '일일 변동률이 이 값 이하이면 텔레그램 급락 알림',
  price_surge_pct: '일일 변동률이 이 값 이상이면 텔레그램 급등 알림',
  fx_change_krw: '원/달러 하루 변동폭이 이 값 이상이면 알림',
  budget_warn_pct: '카테고리별 월 예산 사용률이 이 값을 초과하면 경고',
  daily_summary_hour: '매일 이 시각 (KST) 에 포트폴리오 요약 발송',
  monthly_report_day: '매월 이 날짜에 월간 리포트 발송',
  ta_check_interval_min: 'TA 시그널 스캔 최소 간격',
  ta_ai_guide: 'TA 시그널 알림에 AI 짧은 조언 첨부 (티커별 6h 쿨다운)',
  active_review: 'KR 15:40 / US 07:15 클로징 리뷰 + 주간 리뷰 자동 발송',
  custom_strategy_alerts: '/strategies 에 등록한 조건 발동 시 텔레그램 알림',
}

/** 카테고리 조회 — 알려지지 않은 키는 general */
export function categoryOf(key: string): AlertCategoryKey {
  return ALERT_KEY_CATEGORY[key] ?? 'general'
}

/**
 * 값 형태로 입력 타입 추론 (매핑 우선).
 *
 * fallback 순서:
 *   1. `ALERT_KEY_INPUT_TYPE` 오버라이드
 *   2. on/off → toggle
 *   3. 유한 숫자 → integer
 *   4. 그 외 → text (URL/토큰 등 문자열 값 보존)
 *
 * `integer` fallback 이 넓으면 `<input type="number">` 가 문자열 값을
 * blank 처리 → 데이터 손실 (#396 codex P2 회귀 방지).
 */
export function inputTypeOf(key: string, value: string): AlertInputType {
  const overridden = ALERT_KEY_INPUT_TYPE[key]
  if (overridden) return overridden
  const lower = value.toLowerCase()
  if (lower === 'on' || lower === 'off') return 'toggle'
  const trimmed = value.trim()
  if (trimmed !== '' && Number.isFinite(Number(trimmed))) return 'integer'
  return 'text'
}

/** 카테고리별 그루핑 헬퍼 */
export function groupByCategory<T extends { key: string }>(
  items: T[],
): Array<{ category: AlertCategory; items: T[] }> {
  const buckets = new Map<AlertCategoryKey, T[]>()
  for (const item of items) {
    const cat = categoryOf(item.key)
    if (!buckets.has(cat)) buckets.set(cat, [])
    buckets.get(cat)!.push(item)
  }
  return ALERT_CATEGORIES
    .map((category) => ({ category, items: buckets.get(category.key) ?? [] }))
    .filter((b) => b.items.length > 0)
}
