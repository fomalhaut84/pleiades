/**
 * 기동 전 점검(014 H-2 #800) — `hermes check`. 서버 배포 스크립트 C4 가 부른다. 포트를 열지 않고 게시하지 않는다.
 *
 * 보는 것: 필수 env(PORT · HERMES_STATE_DIR · HERMES_REGISTRY) · 상태 디렉터리 쓰기 · 대기열 열기(WAL) · 레지스트리 검증 ·
 * 웹훅 유무(선택 키 — 없으면 받기만 하고 게시는 멈춘다). 출력은 수치 · 예/아니오만(경로 · 값 없음).
 * rc: 0 기동해도 된다 · 1 기동하면 안 된다(받기가 503 이 되거나 뜨지 못한다).
 */
import { accessSync, constants, mkdirSync } from "node:fs";
import path from "node:path";
import { platformEnv } from "@pleiades/notify";
import { isValidWebhook } from "./poster";
import { openQueue } from "./queue";
import { createRegistry } from "./registry";

export const WEBHOOK_KEY = "DISCORD_WEBHOOK_HERMES";

export function runCheck(env: NodeJS.ProcessEnv, out: (line: string) => void, now = Date.now()): number {
  let rc = 0;
  const port = Number(env.PORT ?? "");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    out("env: PORT 아님");
    rc = 1;
  }
  const stateDir = env.HERMES_STATE_DIR?.trim();
  const registryFile = env.HERMES_REGISTRY?.trim();
  if (!stateDir || !registryFile) {
    out("env: HERMES_STATE_DIR · HERMES_REGISTRY 가 필요하다");
    return 1;
  }
  try {
    mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    accessSync(stateDir, constants.W_OK);
    const q = openQueue(path.join(path.resolve(stateDir), "hermes.db"));
    const c = q.counts();
    out(`대기열: WAL ${q.journalMode() === "wal" ? "예" : "아니오"} · queued ${c.queued} · dead ${c.dead}`);
    q.close();
  } catch (err) {
    out(`대기열: 열지 못했다(${err instanceof Error ? err.name : "Error"})`);
    rc = 1;
  }
  const reg = createRegistry(path.resolve(registryFile)).status(now);
  out(`레지스트리: 출처 ${reg.sources} · 오류 ${reg.error ? "예" : "아니오"}${reg.expiringSoon.length > 0 ? ` · 만료 임박 ${reg.expiringSoon.join(",")}` : ""}`);
  if (reg.error) rc = 1;
  out(`웹훅: ${isValidWebhook(platformEnv(WEBHOOK_KEY)) ? "있음" : "없음(받기만 · 게시 멈춤 — 플랫폼 설정에 키를 넣은 뒤 같은 명령)"}`);
  return rc;
}
