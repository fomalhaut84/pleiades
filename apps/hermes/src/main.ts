/**
 * hermes 진입점(014 · H-1a #791 받기 · H-1b #794 게시 루프 · 상태 파일).
 *
 * env(전부 필수 — 없으면 기동하지 않는다):
 *   PORT                 루프백 포트(B1 · 서버 값은 H-2 에서 고정 · 로컬은 check_env 가 예약 포트를 막는다)
 *   HERMES_STATE_DIR     대기열 hermes.db 자리(체크아웃 밖 · 서버는 H-2)
 *   HERMES_REGISTRY      출처 레지스트리 JSON(서버 비공개 · 체크아웃 밖)
 * 플랫폼 설정(notify platformEnv): DISCORD_WEBHOOK_HERMES — 선택(없으면 받기만 하고 게시는 멈춘다 · 상태 파일 webhook=false).
 */
import { mkdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { platformEnv } from "@pleiades/notify";
import { loadSecrets } from "./checks";
import { createPoster, isValidWebhook, REQUEST_TIMEOUT_MS, type StepResult } from "./poster";
import { buildState, kstDayStart, writeState } from "./state";
import path from "node:path";
import { openQueue } from "./queue";
import { createRateLimiter } from "./rate-limit";
import { createRegistry } from "./registry";
import { createHermesServer } from "./server";
import { runCheck, WEBHOOK_KEY } from "./check";
import { runKeyCli } from "./key-cli";

const HOST = "127.0.0.1";
const PURGE_EVERY_MS = 60 * 60 * 1000;
/** 상태 파일을 다시 쓰는 간격(결과가 바뀌면 바로) */
const STATE_EVERY_MS = 10_000;

/** 결과별 다음 걸음까지 — 보낼 것이 있으면 바로 · 기다릴 때는 최대 5 s 씩 끊어 다시 본다(종료 · 설정 변경에 빨리 반응) */
function pauseAfter(r: StepResult | null): number {
  if (r === null) return 5_000;
  switch (r.kind) {
    case "idle":
      return 1_000;
    case "paused":
      return 5_000;
    case "wait":
      return Math.min(r.ms, 5_000);
    case "retry":
      return Math.min(r.delayMs, 5_000);
    default:
      return 0;
  }
}

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`[hermes] 기동 중단 — ${name} 가 비어 있다`);
    process.exit(1);
  }
  return v;
}

function serve(): void {
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

  const webhook = () => platformEnv(WEBHOOK_KEY);
  const poster = createPoster({
    queue,
    sourceOf: (id) => registry.byId(id),
    webhook,
    secrets: loadSecrets,
    now: Date.now,
    fetch,
  });
  const stateFile = path.join(stateDir, "state.json");
  let linkDropped = { day: kstDayStart(Date.now()), n: 0 };
  let paused: "webhook" | "secrets" | null = null;
  let lastState = 0;
  const saveState = (now: number) => {
    try {
      writeState(
        stateFile,
        buildState(queue, now, {
          webhook: isValidWebhook(webhook()),
          paused,
          registry: registry.status(now),
          linkDroppedToday: linkDropped.day === kstDayStart(now) ? linkDropped.n : 0,
        }),
      );
      lastState = now;
    } catch (err) {
      console.error(`[hermes] 상태 파일 쓰기 실패: ${err instanceof Error ? err.name : "Error"}`);
    }
  };

  let stopping = false;
  let running: Promise<void> = Promise.resolve();
  const naps = new AbortController();
  const nap = (ms: number) => sleep(ms, undefined, { signal: naps.signal }).catch(() => undefined);
  const loop = async () => {
    while (!stopping) {
      let r: StepResult | null = null;
      try {
        r = await poster.step();
      } catch (err) {
        console.error(`[hermes] 게시 루프 오류: ${err instanceof Error ? err.name : "Error"}`);
      }
      const now = Date.now();
      // 멈춤은 다른 결과가 나올 때까지 이어진다 — 기다림 · 할 일 없음 · 루프 오류(9-1 info)는 멈춤을 풀지 않는다
      const nextPaused =
        r?.kind === "paused" ? r.why : r === null || r.kind === "idle" || r.kind === "wait" ? paused : null;
      if (r?.kind === "sent" && poster.lastLinkDropped()) {
        const day = kstDayStart(now);
        linkDropped = { day, n: (linkDropped.day === day ? linkDropped.n : 0) + 1 };
      }
      const changed = nextPaused !== paused || (r !== null && r.kind !== "idle" && r.kind !== "paused" && r.kind !== "wait");
      if (nextPaused !== paused && nextPaused !== null) console.warn(`[hermes] 게시 멈춤 — ${nextPaused === "webhook" ? "웹훅 없음 · 형식 오류" : "비밀 대조 재료를 못 읽음"}`);
      paused = nextPaused;
      if (changed || now - lastState >= STATE_EVERY_MS) saveState(now);
      const wait = pauseAfter(r);
      if (wait > 0 && !stopping) await nap(wait);
    }
  };

  const stop = (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[hermes] ${signal} — 받기를 멈추고 닫는다`);
    hermes.beginShutdown();
    naps.abort();
    // 진행 중인 게시 한 걸음이 끝난 뒤에 대기열을 닫는다 — Discord 가 받았는데 sent 를 못 적으면 재기동 뒤 두 번 나간다(9-1 major)
    const settled = Promise.race([running, sleep(REQUEST_TIMEOUT_MS + 2_000)]);
    void Promise.all([hermes.close(), settled]).finally(() => {
      try {
        saveState(Date.now());
      } finally {
        queue.close();
        process.exit(0);
      }
    });
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));

  hermes.server.listen(port, HOST, () => {
    const st = registry.status(Date.now());
    console.log(`[hermes] 받기 시작 ${HOST}:${port} · 출처 ${st.sources}${st.error ? " · 레지스트리 오류" : ""} · 웹훅 ${isValidWebhook(webhook()) ? "있음" : "없음"}`);
    saveState(Date.now());
    running = loop();
  });
}

/** 서브명령 — 없으면 받기·게시 서버 · `check`(기동 전 점검) · `health`(기동 뒤 확인) · `key …`(출처 키) — 뒤 셋은 H-2(#800) */
function main(argv: readonly string[]): void {
  const [cmd, ...rest] = argv;
  if (cmd === undefined) return serve();
  if (cmd === "check") process.exit(runCheck(process.env, (l) => console.log(l)));
  if (cmd === "health") {
    // 배포 스크립트 C6 — 이 env 의 PORT 로 루프백 /v1/health 가 200 인가(3 s)
    void fetch(`http://${HOST}:${Number(process.env.PORT)}/v1/health`, { signal: AbortSignal.timeout(3_000) }).then(
      (r) => {
        console.log(`health ${r.status}`);
        process.exit(r.status === 200 ? 0 : 1);
      },
      () => {
        console.log("health 연결 실패");
        process.exit(1);
      },
    );
    return;
  }
  if (cmd === "key") {
    const file = process.env.HERMES_REGISTRY?.trim();
    if (!file) {
      console.error("HERMES_REGISTRY 가 필요하다(deploy/hermes/hermes-key.sh 가 넣는다)");
      process.exit(2);
    }
    process.exit(runKeyCli(rest, path.resolve(file), { out: (l) => console.log(l), err: (l) => console.error(l) }));
  }
  console.error("사용: hermes [check | health | key …]");
  process.exit(2);
}

main(process.argv.slice(2));
