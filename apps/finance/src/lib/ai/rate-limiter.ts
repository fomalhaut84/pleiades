/**
 * AI 어드바이저 일일 호출 제한 (인메모리)
 *
 * KST 자정 기준 리셋. 서버 재시작 시 카운터 초기화.
 * 단일 PM2 인스턴스 전제. 멀티 인스턴스 시 Redis/DB 기반으로 전환 필요.
 */

const DEFAULT_DAILY_LIMIT = 30

interface RateLimitState {
  count: number
  resetDate: string // 'YYYY-MM-DD' KST 기준
}

const state: RateLimitState = {
  count: 0,
  resetDate: getTodayKST(),
}

function getTodayKST(): string {
  const now = new Date()
  // KST = UTC + 9
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

function resetIfNewDay(): void {
  const today = getTodayKST()
  if (state.resetDate !== today) {
    state.count = 0
    state.resetDate = today
  }
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  limit: number
  resetDate: string
}

/**
 * 호출 가능 여부 확인 + 카운터 증가
 */
export function checkAndIncrement(
  limit: number = DEFAULT_DAILY_LIMIT
): RateLimitResult {
  resetIfNewDay()

  if (state.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      limit,
      resetDate: state.resetDate,
    }
  }

  state.count += 1

  return {
    allowed: true,
    remaining: limit - state.count,
    limit,
    resetDate: state.resetDate,
  }
}

/**
 * 실패 시 카운터 롤백 (1 감소)
 */
export function decrement(): void {
  resetIfNewDay()
  if (state.count > 0) {
    state.count -= 1
  }
}

/**
 * 현재 상태 조회 (카운터 변경 없음)
 */
export function getRateLimitStatus(
  limit: number = DEFAULT_DAILY_LIMIT
): RateLimitResult {
  resetIfNewDay()

  return {
    allowed: state.count < limit,
    remaining: Math.max(0, limit - state.count),
    limit,
    resetDate: state.resetDate,
  }
}
