/**
 * 게시 루프 한 걸음(014 §3-C 동작 규칙 · §3-F · H-1b #794).
 *
 * 한 번에 하나 · 받은 순서. 성공 판정은 `?wait=true` 응답(없으면 저장 못 한 메시지에도 성공 — 수집기 PR #726 Codex P2).
 * - Discord 429 → `retry_after` 뒤 · 5xx · 연결 실패 · 401/403/404(웹훅 설정) → 지수 백오프(5 s → 상한 10 분)
 * - 400 → 바로 dead(같은 본문은 다시 보내도 같다)
 * - 시도 20회 또는 받은 지 24 h → dead(24 h 넘은 것은 보내 보지도 않는다)
 * - 웹훅 없음 · 형식 오류 → paused(받기는 계속 · 수집기가 `#ops` 로 · H-3) · ① 재료를 못 읽음 → paused(fail-closed)
 * 로그에는 출처 id · 결과 · 상태 코드 · 시도 수만 — 본문 · 웹훅 주소는 쓰지 않는다(§3-I).
 */
import { checkContent } from "./checks";
import { blockedNotice, formatMessage } from "./format";
import type { Queue } from "./queue";
import type { Source } from "./registry";

export const MAX_ATTEMPTS = 20;
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
const WEBHOOK_RE = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/\d+\/[A-Za-z0-9_-]+$/;

export type StepResult =
  | { kind: "idle" }
  | { kind: "paused"; why: "webhook" | "secrets" }
  | { kind: "sent"; id: string }
  | { kind: "blocked"; id: string; reason: string }
  | { kind: "retry"; id: string; delayMs: number }
  | { kind: "dead"; id: string; reason: string };

export interface PosterDeps {
  readonly queue: Queue;
  readonly sourceOf: (id: string) => Source | null;
  readonly webhook: () => string | undefined;
  readonly secrets: () => { ok: boolean; values: readonly string[] };
  readonly now: () => number;
  readonly fetch: typeof fetch;
}

export interface Poster {
  step(): Promise<StepResult>;
  /** 직전 sent 가 허용 밖 링크를 뺐는가(상태 파일 linkDroppedToday) */
  lastLinkDropped(): boolean;
}

export const isValidWebhook = (url: string | undefined): url is string => url !== undefined && WEBHOOK_RE.test(url);

type Outcome = { ok: true } | { ok: false; status: number; retryAfterMs: number | null };

async function send(deps: PosterDeps, hook: string, payload: { content: string; username: string }): Promise<Outcome> {
  const target = new URL(hook);
  target.searchParams.set("wait", "true");
  let res: Response;
  try {
    res = await deps.fetch(target.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, status: 0, retryAfterMs: null };
  }
  if (res.ok) return { ok: true };
  let retryAfterMs: number | null = null;
  if (res.status === 429) {
    const body = (await res.json().catch(() => null)) as { retry_after?: unknown } | null;
    const sec = typeof body?.retry_after === "number" ? body.retry_after : Number(res.headers.get("retry-after"));
    retryAfterMs = Number.isFinite(sec) && sec > 0 ? Math.ceil(sec * 1000) : BACKOFF_BASE_MS;
  } else {
    await res.body?.cancel().catch(() => undefined);
  }
  return { ok: false, status: res.status, retryAfterMs };
}

export function createPoster(deps: PosterDeps): Poster {
  const log = (source: string, result: string, attempts: number) =>
    console.log(`[hermes] 게시 source=${source} result=${result} attempts=${attempts}`);

  let linkDropped = false;
  return {
    lastLinkDropped: () => linkDropped,
    async step() {
      linkDropped = false;
      const now = deps.now();
      const m = deps.queue.nextDue(now);
      if (m === null) return { kind: "idle" };
      const hook = deps.webhook();
      if (!isValidWebhook(hook)) return { kind: "paused", why: "webhook" };
      if (now - m.receivedAt >= MAX_AGE_MS) {
        deps.queue.markDead(m.id, "age", now);
        log(m.source, "dead(age)", m.attempts);
        return { kind: "dead", id: m.id, reason: "age" };
      }
      const sec = deps.secrets();
      if (!sec.ok) return { kind: "paused", why: "secrets" };

      const formatted = formatMessage(m, deps.sourceOf(m.source));
      const reason = checkContent(formatted.content, sec.values);
      // 보낼 칸만 고른다 — formatted 의 내부 칸(linkDropped)이 Discord 요청에 섞이지 않게
      const payload =
        reason === null ? { content: formatted.content, username: formatted.username } : blockedNotice(m.source, reason);
      const out = await send(deps, hook, payload);
      const done = deps.now();

      if (out.ok) {
        if (reason === null) {
          deps.queue.markSent(m.id, done);
          linkDropped = formatted.linkDropped;
          log(m.source, formatted.linkDropped ? "sent(link-dropped)" : "sent", m.attempts + 1);
          return { kind: "sent", id: m.id };
        }
        deps.queue.markBlocked(m.id, reason, done);
        log(m.source, `blocked(${reason})`, m.attempts + 1);
        return { kind: "blocked", id: m.id, reason };
      }
      if (out.status === 400) {
        deps.queue.markDead(m.id, "discord-400", done);
        log(m.source, "dead(discord-400)", m.attempts + 1);
        return { kind: "dead", id: m.id, reason: "discord-400" };
      }
      if (m.attempts + 1 >= MAX_ATTEMPTS) {
        deps.queue.markDead(m.id, "attempts", done);
        log(m.source, `dead(attempts · ${out.status})`, m.attempts + 1);
        return { kind: "dead", id: m.id, reason: "attempts" };
      }
      const delayMs = out.retryAfterMs ?? Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** m.attempts);
      deps.queue.markRetry(m.id, now + delayMs);
      log(m.source, `retry(${out.status})`, m.attempts + 1);
      return { kind: "retry", id: m.id, delayMs };
    },
  };
}
