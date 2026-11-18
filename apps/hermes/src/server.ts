/**
 * 받기 API(014 §2 · H-1a #791) — `POST /v1/messages` · `GET /v1/health`.
 *
 * 순서: 경로 → 닫는 중(503) → 인증(401 · 403 · 레지스트리 오류 503) → 속도(429) → Content-Type(415) → 본문 상한(413) →
 * Idempotency-Key · 형식(400 사유 코드) → 대기열 커밋(실패 503) → 202. **인증 전에는 본문을 읽지 않는다.**
 * 로그에는 출처 id · 상태 · 길이만 — 본문 · 키는 쓰지 않는다(§3-I).
 * 루프백에 묶는 것은 main 이다(B1). `X-Real-IP` 는 쓰지 않는다(B2 에서 nginx 와 함께 · #703 교훈).
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Queue } from "./queue";
import type { RateLimiter } from "./rate-limit";
import type { Registry } from "./registry";
import { validateIdempotencyKey, validateMessage } from "./validate";

export const MAX_BODY_BYTES = 16 * 1024;

export interface HermesDeps {
  readonly registry: Registry;
  readonly queue: Queue;
  readonly limiter: RateLimiter;
  readonly now: () => number;
}

export interface HermesServer {
  readonly server: Server;
  /** 새 요청을 503 으로 — 종료 신호를 받은 뒤 */
  beginShutdown(): void;
  close(): Promise<void>;
}

type Reply = { status: number; body: Record<string, unknown>; headers?: Record<string, string> };

const json = (res: ServerResponse, r: Reply, close = false): void => {
  const text = JSON.stringify(r.body);
  res.writeHead(r.status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
    "cache-control": "no-store",
    ...(close ? { connection: "close" } : {}),
    ...r.headers,
  });
  res.end(text);
};

/** 상한까지 읽는다 — 넘으면 null(읽기를 멈춘다) */
function readBody(req: IncomingMessage, limit: number): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"] ?? "0");
    if (Number.isFinite(declared) && declared > limit) {
      resolve(null);
      return;
    }
    const parts: Buffer[] = [];
    let size = 0;
    let done = false;
    req.on("data", (chunk: Buffer) => {
      if (done) return;
      size += chunk.length;
      if (size > limit) {
        done = true;
        resolve(null);
        return;
      }
      parts.push(chunk);
    });
    req.on("end", () => {
      if (!done) resolve(Buffer.concat(parts));
    });
    req.on("error", (err) => {
      if (!done) reject(err);
    });
  });
}

export function createHermesServer(deps: HermesDeps): HermesServer {
  let shuttingDown = false;

  const handleMessage = async (req: IncomingMessage): Promise<{ reply: Reply; source: string; bytes: number; close: boolean }> => {
    const early = (status: number, body: Record<string, unknown>, headers?: Record<string, string>, source = "-") => ({
      reply: { status, body, headers },
      source,
      bytes: 0,
      close: true, // 읽지 않은 본문이 남은 연결은 닫는다
    });
    if (shuttingDown) return early(503, { error: "unavailable" });
    const auth = deps.registry.authenticate(req.headers.authorization, deps.now());
    if (!auth.ok) {
      const error = auth.status === 401 ? "unauthorized" : auth.status === 403 ? "forbidden" : "unavailable";
      return early(auth.status, { error });
    }
    const source = auth.source;
    const rate = deps.limiter.take(source.id, source.ratePerMinute, deps.now());
    if (!rate.ok) return early(429, { error: "rate-limited" }, { "retry-after": String(rate.retryAfterSec) }, source.id);
    const ctype = (req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if (ctype !== "application/json") return early(415, { error: "content-type" }, undefined, source.id);
    const body = await readBody(req, MAX_BODY_BYTES);
    if (body === null) return early(413, { error: "too-large" }, undefined, source.id);
    const done = (status: number, b: Record<string, unknown>) => ({
      reply: { status, body: b },
      source: source.id,
      bytes: body.length,
      close: false,
    });
    const idem = validateIdempotencyKey(req.headers["idempotency-key"]);
    if (!idem.ok) return done(400, { error: "invalid", reason: idem.reason });
    const msg = validateMessage(body.toString("utf8"));
    if (!msg.ok) return done(400, { error: "invalid", reason: msg.reason });
    try {
      const r = deps.queue.enqueue(
        { source: source.id, ...(idem.value !== null ? { idempotencyKey: idem.value } : {}), ...msg.value },
        deps.now(),
      );
      return done(202, { id: r.id, duplicate: r.duplicate });
    } catch (err) {
      console.error(`[hermes] 대기열 쓰기 실패 source=${source.id}: ${err instanceof Error ? err.name : "Error"}`);
      return done(503, { error: "unavailable" });
    }
  };

  const server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0];
    if (url === "/v1/health") {
      if (req.method !== "GET") return json(res, { status: 405, body: { error: "method" }, headers: { allow: "GET" } });
      return json(res, { status: 200, body: { ok: true } });
    }
    if (url !== "/v1/messages") return json(res, { status: 404, body: { error: "not-found" } }, true);
    if (req.method !== "POST") {
      return json(res, { status: 405, body: { error: "method" }, headers: { allow: "POST" } }, true);
    }
    handleMessage(req).then(
      ({ reply, source, bytes, close }) => {
        console.log(`[hermes] POST /v1/messages source=${source} status=${reply.status} len=${bytes}`);
        json(res, reply, close);
      },
      (err: unknown) => {
        console.error(`[hermes] 요청 처리 실패: ${err instanceof Error ? err.name : "Error"}`);
        if (!res.headersSent) json(res, { status: 500, body: { error: "internal" } }, true);
      },
    );
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;

  return {
    server,
    beginShutdown() {
      shuttingDown = true;
    },
    close() {
      shuttingDown = true;
      return new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    },
  };
}
