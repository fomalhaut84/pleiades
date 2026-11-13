// apps/advisor — 통합 어드바이저 진입점 (012 §8 · 4b).
// 4b-1b(#680): 코어를 손으로 부르는 두 명령. Discord 조립(4b-2)이 붙기 전까지 상주하지 않는다.
//   probe        두 도메인 읽기 경로(tools/list · prompts/get)와 배포 락 상태만 본다 — 모델 호출 0
//   ask <채널ID> <사용자ID>   질문을 stdin 으로 받아 한 번 답한다(같은 프로세스 안에서만 세션이 이어진다)
// 로컬 실행은 tools/local/run.sh adv -- node dist/advisor.cjs … 만 — claude 는 shim 이라 모델 호출 0(I-8) · pm2 리허설 없음(012 §4-3).
import os from "node:os";
import path from "node:path";
import { Advisor } from "./advisor";
import { resolveClaude } from "./cli";
import { lockFileOf, probeDeployLock } from "./deploy-lock";
import { privateRoot } from "./private-dir";
import { sessionKey } from "./session-store";

export const USAGE = "사용: advisor probe | advisor ask <채널ID> <사용자ID>  (질문은 stdin)";

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
    })
    .catch(() => {
      process.stderr.write("advisor: 시작하지 못했다 (설정 · 비공개 위치 · domain.json 확인)\n");
      process.exitCode = 1;
    });
}
