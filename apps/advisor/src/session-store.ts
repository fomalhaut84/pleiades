// 대화 세션 (#680 · 012 축 D · [D3] · §6 다중 사용자 자리).
// 키 `discord:<채널ID>:<사용자ID>` — 통합 층 자기 Map(앱 세션과 무관). 세션 시작에 정한 시스템 프롬프트·허용 목록·MCP 설정을
// 세션 동안 고정한다(같은 CLI 세션을 이어 묻는다). 24h 미사용 또는 컨텍스트 100,000 토큰을 넘으면 새 세션(fin·fit 값 · 012 [N11]).
// 컨텍스트 = 마지막 호출의 input + cache_read + cache_creation — resume 대화는 대부분 캐시라 input 만 보면 상한에 닿지 않는다(9-1 major M3).
export const SESSION_IDLE_MS = 24 * 60 * 60_000;
export const SESSION_MAX_CONTEXT_TOKENS = 100_000;

const KEY = /^discord:\d{1,25}:\d{1,25}$/;
export const sessionKey = (channelId: string, userId: string): string => {
  const k = `discord:${channelId}:${userId}`;
  if (!KEY.test(k)) throw new Error("세션 키 형식 — 채널·사용자 ID 는 숫자");
  return k;
};

export interface SessionFrame {
  system: string;
  allow: readonly string[];
  serverKeys: readonly string[];
  prefixes: readonly string[];
  mcpConfigPath: string;
  /** 쓰지 못한 도메인 안내(세션 동안 같다) — 없으면 "" */
  missing: string;
}

export interface Session extends SessionFrame {
  cliSessionId: string | null;
  lastUsedAt: number;
  /** 마지막 호출의 컨텍스트 크기(누적 아님 — resume 은 이전 대화를 다시 싣는다) */
  contextTokens: number;
}

export class SessionStore {
  private readonly map = new Map<string, Session>();

  constructor(private readonly now: () => number = Date.now) {}

  /** 살아 있는 세션 — 만료·토큰 초과면 지우고 undefined */
  get(key: string): Session | undefined {
    const s = this.map.get(key);
    if (!s) return undefined;
    if (this.now() - s.lastUsedAt > SESSION_IDLE_MS || s.contextTokens > SESSION_MAX_CONTEXT_TOKENS) {
      this.map.delete(key);
      return undefined;
    }
    return s;
  }

  start(key: string, frame: SessionFrame): Session {
    const s: Session = { ...frame, cliSessionId: null, lastUsedAt: this.now(), contextTokens: 0 };
    this.map.set(key, s);
    return s;
  }

  /** 답이 끝난 뒤 — CLI 세션 id 와 컨텍스트 크기를 새 값으로(불변 갱신) */
  record(key: string, cliSessionId: string | null, contextTokens: number | null): void {
    const s = this.map.get(key);
    if (!s) return;
    this.map.set(key, {
      ...s,
      cliSessionId: cliSessionId ?? s.cliSessionId,
      lastUsedAt: this.now(),
      contextTokens: contextTokens ?? s.contextTokens,
    });
  }

  reset(key: string): boolean {
    return this.map.delete(key);
  }
}
