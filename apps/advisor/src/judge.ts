// 순수 판정 — CLI stream-json · 세션 init (012 §8 4b-1 · #680).
// X1 `deploy/advisor-x1/judge.cjs`(#632 · #634 · #645)를 대화용으로 옮겼다. 파일·프로세스·네트워크를 건드리지 않는다.
// X1 저장소 판·서버 설치본은 그대로다(끝난 실험 — 이 파일과 따로 갱신하지 않는다).

/** init 뒤 hook(#635) — status 는 "init" 이지만 모델 비용이 났을 수 있다(costOf · 이어 묻기 재시도가 갈라 본다 · #711) */
export const POST_INIT_HOOK_CODE = "violation:hook";

const NAME_OK = /^[A-Za-z0-9_]{1,80}$/;
/** 로그·양식에 실을 수 있는 이름만 — 아니면 '?' (외부 문자열을 그대로 싣지 않는다) */
export const safeName = (s: unknown): string => (typeof s === "string" && NAME_OK.test(s) ? s : "?");

export interface ToolCall {
  name: string;
  ok: boolean;
}

export interface StreamResult {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: unknown;
  session_id?: unknown;
  total_cost_usd?: unknown;
  num_turns?: unknown;
  usage?: { input_tokens?: unknown; cache_read_input_tokens?: unknown; cache_creation_input_tokens?: unknown };
  modelUsage?: unknown;
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null;

/** stream-json 텍스트 → 도구 호출(성공 여부) · 마지막 result 이벤트 · hook 이벤트 수(어느 줄이든 · 9-1 info 7) */
export function parseStream(text: string): { calls: ToolCall[]; result: StreamResult | null; hooks: number } {
  const calls: ToolCall[] = [];
  const byId = new Map<string, ToolCall>();
  let result: StreamResult | null = null;
  let hooks = 0;
  for (const line of text.split("\n")) {
    let e: unknown;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isObj(e)) continue;
    if (e.type === "system" && typeof e.subtype === "string" && e.subtype.startsWith("hook_")) hooks++;
    const msg = isObj(e.message) ? e.message : null;
    const content = msg && Array.isArray(msg.content) ? (msg.content as unknown[]) : [];
    if (e.type === "assistant") {
      for (const b of content) {
        if (isObj(b) && b.type === "tool_use" && typeof b.name === "string") {
          const c = { name: b.name, ok: false };
          calls.push(c);
          if (typeof b.id === "string") byId.set(b.id, c);
        }
      }
    } else if (e.type === "user") {
      for (const b of content) {
        if (isObj(b) && b.type === "tool_result" && typeof b.tool_use_id === "string" && byId.has(b.tool_use_id)) {
          byId.get(b.tool_use_id)!.ok = b.is_error !== true;
        }
      }
    } else if (e.type === "result") {
      result = e as StreamResult;
    }
  }
  return { calls, result, hooks };
}

// ── 세션 init 판정(fail-closed · X1 #634) ───────────────────────────
// violation: 플러그인 ≥1 · 서버 수·이름 불일치 · 목록 밖 도구 · init 앞 hook 이벤트(#635 교훈 — 설계 밖 맥락이 들어오는 길)
// format: init 없음 · 필드 형식 · 서버 미연결(알 수 없는 상태 포함) — 자식을 끊되 위반은 아니다
const KNOWN_STATUS = new Set(["connected", "pending", "failed", "needs-auth", "disabled"]);
/**
 * CLI 내장 플러그인(서버 CLI 2.1.311 실측 · X1 #645). 출처 문자열이 정확히 같을 때만 내장으로 본다.
 * CLI 업데이트로 새 내장이 생기면 위반으로 멈춘다(012 R-12 — 멈춤이 안전 쪽) → 이 목록을 갱신하는 PR.
 */
export const BUILTIN_PLUGINS: ReadonlySet<string> = new Set([
  "cc-plugin-agents-md@builtin",
  "cc-plugin-telemetry@builtin",
  "cc-plugin-plugin-authoring@builtin",
]);

export interface InitVerdict {
  ok: boolean;
  kind: "" | "violation" | "format";
  why: string;
  plugins?: number;
  builtin?: number;
  servers?: number;
  connected?: number;
  outside?: number;
  /** 연결되지 않은 serverKey — CLI 가 준 이름이 아니라 우리 선언의 이름(domains.ts KEY 검사를 거쳤다 · safeName 과 같은 문자 집합) · "MCP 미연결" 일 때만 · 제공자 제외에 쓴다(015 §4-3 V-2c) */
  unconnected?: string[];
}

const fmt = (why: string, extra: Partial<InitVerdict> = {}): InitVerdict => ({ ok: false, kind: "format", why, ...extra });

export function judgeInit(e: unknown, allow: ReadonlySet<string>, serverKeys: readonly string[]): InitVerdict {
  if (isObj(e) && e.type === "system" && typeof e.subtype === "string" && e.subtype.startsWith("hook_")) {
    return { ok: false, kind: "violation", why: "init 전 hook" };
  }
  if (!isObj(e) || e.type !== "system" || e.subtype !== "init") return fmt("init 없음");
  if (!Array.isArray(e.tools) || !Array.isArray(e.mcp_servers) || !Array.isArray(e.plugins)) return fmt("init 필드 없음");
  if (["plugin_errors", "mcp_server_errors"].some((k) => e[k] !== undefined && !Array.isArray(e[k]))) return fmt("init 필드 형식");
  const plugins = e.plugins as unknown[];
  const servers = e.mcp_servers as unknown[];
  const pluginErrors = (e.plugin_errors as unknown[] | undefined) ?? [];
  const serverErrors = (e.mcp_server_errors as unknown[] | undefined) ?? [];
  const isBuiltin = (p: unknown) => isObj(p) && typeof p.source === "string" && BUILTIN_PLUGINS.has(p.source);
  const builtin = plugins.filter(isBuiltin).length;
  const pluginCount = plugins.length - builtin + pluginErrors.length;
  const names = servers.map((m) => (isObj(m) ? m.name : undefined));
  const connected = serverKeys.filter((k) => servers.some((m) => isObj(m) && m.name === k && m.status === "connected")).length;
  const outside = (e.tools as unknown[]).filter((t) => typeof t !== "string" || !allow.has(t)).length; // 내장 도구(--tools "")도 여기서 걸린다
  const extraServer = servers.length !== serverKeys.length || !serverKeys.every((k) => names.includes(k)) || serverErrors.length > 0;
  const counts = { plugins: pluginCount, builtin, servers: servers.length, connected, outside };
  const why = pluginCount ? "플러그인" : extraServer ? "MCP 서버" : outside ? "목록 밖 도구" : "";
  if (why) return { ok: false, kind: "violation", why, ...counts };
  if (connected !== serverKeys.length) {
    const unknown = servers.some((m) => !isObj(m) || typeof m.status !== "string" || !KNOWN_STATUS.has(m.status));
    if (unknown) return fmt("알 수 없는 MCP 상태", counts);
    // pending · failed · needs-auth · disabled 모두 미연결 — 어느 쪽이든 그 제공자는 이번 세션에서 쓸 수 없다(015 Q467 ①)
    const unconnected = serverKeys.filter((k) => !servers.some((m) => isObj(m) && m.name === k && m.status === "connected"));
    return fmt("MCP 미연결", { ...counts, unconnected });
  }
  return { ok: true, kind: "", why: "", ...counts };
}

// ── 답 판정(대화용) ─────────────────────────────────────────────────
export type AnswerStatus = "완료" | "상한" | "오류" | "init";
/** 모델 드리프트(#255) — 실제 쓴 모델이 고정 핀과 같은가 */
export type Drift = "없음" | "있음" | "판정 불가";

export interface AnswerVerdict {
  status: AnswerStatus;
  /** 오류 분류(로그용 · safeName) */
  code: string;
  text: string;
  sessionId: string | null;
  cost: number | null;
  turns: number | null;
  /** 이번 호출의 컨텍스트 크기 = (input + cache_read + cache_creation) ÷ num_turns(--resume 대화는 대부분 캐시다 · 9-1 major M3 · 턴 평균 #721) */
  contextTokens: number | null;
  drift: Drift;
  /** init 위반(→ 안전 문구) — 형식·실행 오류와 나눈다(9-1 info 2) */
  violation: boolean;
  /** 도메인 접두별 호출 수 · 성공 수 */
  byPrefix: Record<string, { n: number; ok: number }>;
  /** 허용 목록 밖 호출 수 — 0 이 아니면 위반(구조상 0 이어야 한다 · 012 §2-1) */
  outside: number;
}

export interface RawRun {
  out: string;
  timedOut: boolean;
  init: InitVerdict | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// 결과 usage 는 한 호출 안 내부 턴(도구 왕복)의 합이다 — fit 실측(#721 · 2026-11-17: 14턴 ≈168k · 턴당 12~16k).
// 그대로 쓰면 세션 상한(100k)이 일찍 걸린다 → 턴 평균(fit #683 contextTokensOf 와 같은 기준 · 마지막 호출보다 조금 작게 잡는다)
function contextOf(result: StreamResult | null): number | null {
  const u = result && isObj(result.usage) ? result.usage : null;
  if (!u) return null;
  const parts = [u.input_tokens, u.cache_read_input_tokens, u.cache_creation_input_tokens].map(num);
  if (parts[0] === null) return null;
  const sum = parts.reduce<number>((a, b) => a + (b ?? 0), 0);
  const turns = num(result?.num_turns);
  return turns !== null && turns > 1 ? Math.round(sum / turns) : sum;
}

export interface ModelPin {
  haiku: string;
  sonnet: string;
}

/** modelUsage 키가 모두 핀 안이고 sonnet 을 썼으면 없음 · 비었으면 판정 불가(X1 judgeAnswer · fit warnModelDrift 와 같은 기준) */
export function judgeDrift(modelUsage: unknown, pin: ModelPin): Drift {
  const used = isObj(modelUsage) ? Object.keys(modelUsage) : [];
  if (!used.length) return "판정 불가";
  return used.every((m) => m === pin.sonnet || m === pin.haiku) && used.includes(pin.sonnet) ? "없음" : "있음";
}

export function judgeAnswer(r: RawRun, allow: ReadonlySet<string>, prefixes: readonly string[], pin: ModelPin): AnswerVerdict {
  const { calls, result, hooks } = parseStream(r.out);
  const byPrefix: AnswerVerdict["byPrefix"] = {};
  for (const p of prefixes) {
    const mine = calls.filter((c) => c.name.startsWith(p));
    byPrefix[p] = { n: mine.length, ok: mine.filter((c) => c.ok).length };
  }
  let status: AnswerStatus = "완료";
  let code = "";
  const violation = (!!r.init && r.init.kind === "violation") || hooks > 0;
  if (!r.init || !r.init.ok) [status, code] = ["init", r.init ? `${r.init.kind}:${r.init.why}` : "init 없음"];
  else if (hooks > 0) [status, code] = ["init", POST_INIT_HOOK_CODE]; // init 뒤 hook — 설계 밖 맥락이 로드됐다(#635)
  else if (r.timedOut) [status, code] = ["오류", "timeout"];
  else if (!result) [status, code] = ["오류", "no-result"];
  else if (result.subtype === "error_max_budget_usd") [status, code] = ["상한", "error_max_budget_usd"];
  else if (result.is_error === true || result.subtype !== "success") [status, code] = ["오류", safeName(String(result.subtype))];
  const sid = result && typeof result.session_id === "string" && /^[A-Za-z0-9-]{8,80}$/.test(result.session_id) ? result.session_id : null;
  return {
    status,
    code,
    text: status === "완료" && result && typeof result.result === "string" ? result.result : "",
    sessionId: sid,
    cost: result ? num(result.total_cost_usd) : null,
    turns: result ? num(result.num_turns) : null,
    contextTokens: contextOf(result),
    drift: result ? judgeDrift(result.modelUsage, pin) : "판정 불가",
    violation,
    byPrefix,
    outside: calls.filter((c) => !allow.has(c.name)).length,
  };
}
