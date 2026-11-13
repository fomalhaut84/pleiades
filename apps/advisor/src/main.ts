// apps/advisor — 통합 어드바이저 진입점 (012 §8 · 4b).
// 4b-1b(#680) · 4b-2b(#686):
//   bot          Discord 통합 채널 상주(4b-3 에서 서버 pm2 `pleiades-adv-bot` 이 이것을 띄운다)
//   probe        두 도메인 읽기 경로(tools/list · prompts/get)와 배포 락 상태만 본다 — 모델 호출 0
//   ask <채널ID> <사용자ID>   질문을 stdin 으로 받아 한 번 답한다(같은 프로세스 안에서만 세션이 이어진다)
// 로컬 실행은 tools/local/run.sh adv -- node dist/advisor.cjs … 만 — claude 는 shim 이라 모델 호출 0(I-8) · pm2 리허설 없음(012 §4-3).
import os from "node:os";
import path from "node:path";
import { Advisor } from "./advisor";
import { resolveClaude } from "./cli";
import { lockFileOf, probeDeployLock } from "./deploy-lock";
import { Inflight, startBotWhenReady } from "./bot";
import { botConfig, createAdminAlert } from "./platform";
import { privateRoot } from "./private-dir";
import { DailySpend } from "./spend";
import { sessionKey } from "./session-store";

/** 종료 때 진행 중 질문(정산 포함)을 기다리는 최대 시간 — pm2 `kill_timeout`(15 s · deploy/advisor) 안 (012 4b-3a2 #695 B7) */
export const SHUTDOWN_GRACE_MS = 10_000;

export const USAGE = "사용: advisor bot | advisor probe | advisor ask <채널ID> <사용자ID>  (질문은 stdin)";

type Write = (line: string) => void;

/** probe 는 모델을 부르지 않으므로 claude 없이도 돈다(9-1 info 10) */
function makeAdvisor(env: NodeJS.ProcessEnv, log: Write, needClaude: boolean): Advisor {
  return new Advisor({
    appsDir: path.resolve(process.cwd(), ".."),
    privateRoot: privateRoot(env),
    env,
    claude: { bin: needClaude ? resolveClaude(env) : "" },
    settingsDirs: {
      claudeDir: env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"),
      managedDir: "/etc/claude-code",
    },
    log,
  });
}

/** 버퍼를 모아 한 번에 UTF-8 로 — 청크마다 디코드하면 경계에 걸린 한글이 깨진다(PR #684 Codex P2) */
export async function readAll(stream: AsyncIterable<Buffer | string>): Promise<string> {
  const parts: Buffer[] = [];
  for await (const c of stream) parts.push(typeof c === "string" ? Buffer.from(c, "utf8") : c);
  return Buffer.concat(parts).toString("utf8");
}

const readStdin = () => readAll(process.stdin);

/** 종료 코드: 0 정상 · 1 거부·실패 · 2 사용법 */
export async function main(argv: string[], env: NodeJS.ProcessEnv, out: Write, err: Write, input = readStdin): Promise<number> {
  const [cmd, ...rest] = argv;
  if (cmd === "probe" && rest.length === 0) {
    const adv = makeAdvisor(env, err, false);
    const lock = probeDeployLock(lockFileOf(privateRoot(env)));
    const ready = await adv.prepareAll();
    out(`배포 락: ${lock}`);
    for (const d of ready) out(d.ok ? `${d.id}: 준비됨 · 읽기 도구 ${d.allow.length} · 지식 ${Buffer.byteLength(d.knowledge, "utf8")} B` : `${d.id}: 쓸 수 없음 · ${d.why}`);
    return ready.some((d) => d.ok) ? 0 : 1;
  }
  if (cmd === "bot" && rest.length === 0) {
    const log: Write = (l) => out(l);
    const advisor = makeAdvisor(env, log, true);
    const inflight = new Inflight();
    const handle = startBotWhenReady({
      advisor,
      spend: new DailySpend(path.join(privateRoot(env), "advisor")),
      alert: createAdminAlert(log),
      config: () => botConfig(),
      log,
      inflight,
    });
    await new Promise<void>((resolve) => {
      const stop = () => {
        resolve();
      };
      process.once("SIGTERM", stop);
      process.once("SIGINT", stop); // pm2 기본 종료 신호 — 트리 전체(자식 claude 포함)에 간다
    });
    // B7: 새 입력 끊기 → 새 질문 거부 · 진행 중 CLI 끊기 → 정산까지 기다림(최대 SHUTDOWN_GRACE_MS)
    handle.stop();
    advisor.shutdown();
    const drained = await inflight.idle(SHUTDOWN_GRACE_MS);
    log(`[advisor] 종료 — 진행 중 질문 ${drained ? "정산 완료" : `${SHUTDOWN_GRACE_MS}ms 안에 끝나지 않음(예약분이 남는다)`}`);
    return 0;
  }
  if (cmd === "ask" && rest.length === 2) {
    let key: string;
    try {
      key = sessionKey(rest[0], rest[1]);
    } catch {
      err(USAGE);
      return 2;
    }
    const r = await makeAdvisor(env, err, true).ask(key, await input());
    out(r.text);
    return r.kind === "answer" ? 0 : 1;
  }
  err(USAGE);
  return 2;
}

if (require.main === module) {
  main(process.argv.slice(2), process.env, (l) => process.stdout.write(`${l}\n`), (l) => process.stderr.write(`${l}\n`))
    .then((code) => {
      process.exitCode = code;
      // bot 은 종료 처리를 마쳤다 — 남은 핸들(타이머 · 소켓)을 기다리지 않는다(pm2 kill_timeout 안)
      if (process.argv[2] === "bot") process.exit(code);
    })
    .catch(() => {
      process.stderr.write("advisor: 시작하지 못했다 (설정 · 비공개 위치 · domain.json 확인)\n");
      process.exitCode = 1;
    });
}
