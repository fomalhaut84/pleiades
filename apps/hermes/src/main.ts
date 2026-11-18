/**
 * hermes 진입점(014 · H-1a #791) — 받기만. 게시 루프는 H-1b.
 *
 * env(전부 필수 — 없으면 기동하지 않는다):
 *   PORT                 루프백 포트(B1 · 서버 값은 H-2 에서 고정 · 로컬은 check_env 가 예약 포트를 막는다)
 *   HERMES_STATE_DIR     대기열 hermes.db 자리(체크아웃 밖 · 서버는 H-2)
 *   HERMES_REGISTRY      출처 레지스트리 JSON(서버 비공개 · 체크아웃 밖)
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { openQueue } from "./queue";
import { createRateLimiter } from "./rate-limit";
import { createRegistry } from "./registry";
import { createHermesServer } from "./server";

const HOST = "127.0.0.1";
const PURGE_EVERY_MS = 60 * 60 * 1000;

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`[hermes] 기동 중단 — ${name} 가 비어 있다`);
    process.exit(1);
  }
  return v;
}

function main(): void {
  const port = Number(required("PORT"));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("[hermes] 기동 중단 — PORT 가 포트 번호가 아니다");
    process.exit(1);
  }
  const stateDir = path.resolve(required("HERMES_STATE_DIR"));
  const registryFile = path.resolve(required("HERMES_REGISTRY"));
  mkdirSync(stateDir, { recursive: true, mode: 0o700 });

  const queue = openQueue(path.join(stateDir, "hermes.db"));
  const registry = createRegistry(registryFile);
  const hermes = createHermesServer({ registry, queue, limiter: createRateLimiter(), now: Date.now });

  const purge = setInterval(() => {
    try {
      const n = queue.purge(Date.now());
      if (n > 0) console.log(`[hermes] 보존 기간 지난 행 ${n} 삭제`);
    } catch (err) {
      console.error(`[hermes] 보존 정리 실패: ${err instanceof Error ? err.name : "Error"}`);
    }
  }, PURGE_EVERY_MS);
  purge.unref();

  let stopping = false;
  const stop = (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[hermes] ${signal} — 받기를 멈추고 닫는다`);
    hermes.beginShutdown();
    void hermes.close().finally(() => {
      queue.close();
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));

  hermes.server.listen(port, HOST, () => {
    const st = registry.status(Date.now());
    console.log(`[hermes] 받기 시작 ${HOST}:${port} · 출처 ${st.sources}${st.error ? " · 레지스트리 오류" : ""}`);
  });
}

main();
