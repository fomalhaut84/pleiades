/**
 * 채널별 Claude CLI 세션 보관소.
 * - 봇 프로세스에서 사용자 채팅 / cron 리포트 등이 같은 sessionId 공유로 컨텍스트 오염되는 것을 방지.
 * - TTL (6h 무활동) 또는 컨텍스트 크기 한도 (100k) 초과 시 자동 reset.
 *   크기 = 마지막 호출의 (입력 + 캐시 읽기 + 캐시 생성) ÷ num_turns(턴 평균) — `--resume` 대화는 입력 대부분이 캐시라
 *   `input_tokens` 만 누적하면 한도에 닿지 않았다(pleiades#683 · 통합 층 #680 과 같은 기준).
 * - 메모리 상태 (재시작 시 초기화) — 영속 불필요.
 * - #552 R6: 세션을 만든 시스템 프롬프트 버전을 기록 — 웹에서 다른 버전을 활성화하면 다음 호출에서 새 세션.
 *   웹 · 봇이 별도 PM2 프로세스라 활성화 시점에 상대 프로세스 메모리를 비울 수 없어서 각자 호출 때 감지한다.
 */

const TTL_MS = 6 * 60 * 60 * 1000;
const TOKEN_LIMIT = 100_000;

interface SessionEntry {
  sessionId: string;
  lastActiveAt: number;
  /** 마지막 호출의 컨텍스트 크기(토큰) */
  contextTokens: number;
  /** 세션 시작 때의 시스템 프롬프트 버전 (코드 기본값 폴백이면 null) */
  systemVersionId: string | null;
}

const store = new Map<string, SessionEntry>();

/**
 * 채널의 유효 sessionId 반환. TTL/토큰 한도 초과 시 자동 reset 후 null.
 * `systemVersionId` 를 주면 세션의 시스템 프롬프트 버전과 다를 때도 reset (#552 R6).
 */
export function getSession(channel: string, systemVersionId?: string | null): string | null {
  const entry = store.get(channel);
  if (!entry) return null;
  if (systemVersionId !== undefined && entry.systemVersionId !== systemVersionId) {
    store.delete(channel);
    return null;
  }
  const now = Date.now();
  if (now - entry.lastActiveAt > TTL_MS) {
    store.delete(channel);
    return null;
  }
  if (entry.contextTokens > TOKEN_LIMIT) {
    store.delete(channel);
    return null;
  }
  return entry.sessionId;
}

interface CliUsage {
  input_tokens?: unknown;
  cache_read_input_tokens?: unknown;
  cache_creation_input_tokens?: unknown;
}

const finite = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : null);

/**
 * CLI `usage` → 컨텍스트 크기. `input_tokens` 가 없으면 판정 불가(null) — 캐시 필드는 없으면 0.
 * 결과의 `usage` 는 한 호출 안의 내부 턴(도구 왕복)을 합친 값일 수 있다 — 턴마다 같은 앞부분을 캐시로 다시 읽어
 * 턴 수만큼 커진다. 그래서 `numTurns` 로 나눈 평균을 쓴다(합이 아니어도 작게 잡힐 뿐 · 일찍 끊지 않는다 · #683 9-1).
 */
export function contextTokensOf(usage: CliUsage | undefined | null, numTurns?: unknown): number | null {
  if (!usage) return null;
  const input = finite(usage.input_tokens);
  if (input === null) return null;
  const sum = input + (finite(usage.cache_read_input_tokens) ?? 0) + (finite(usage.cache_creation_input_tokens) ?? 0);
  const turns = finite(numTurns);
  return turns !== null && turns > 1 ? Math.round(sum / turns) : sum;
}

/** 세션 갱신. 크기는 누적하지 않고 마지막 호출 값으로 바꾼다 · null(모름)이면 직전 값을 둔다. */
export function setSession(
  channel: string,
  sessionId: string,
  contextTokens: number | null = null,
  systemVersionId: string | null = null
): void {
  const existing = store.get(channel);
  store.set(channel, {
    sessionId,
    lastActiveAt: Date.now(),
    contextTokens: contextTokens ?? existing?.contextTokens ?? 0,
    systemVersionId,
  });
}

/** 특정 채널 reset. */
export function resetSession(channel: string): void {
  store.delete(channel);
}

/** 모든 채널 reset (디버깅/긴급용). */
export function resetAll(): void {
  store.clear();
}
