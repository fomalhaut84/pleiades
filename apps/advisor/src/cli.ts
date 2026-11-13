// Claude CLI 실행 — 모델 고정 · 자식 env · 인자 · 1회 실행 (#680).
// X1 `pins` · `childEnv` · `cliArgs` · `askOnce`(#632 · #634)를 대화용으로 옮겼다:
// - 세션을 디스크에 남긴다(`--no-session-persistence` 없음) · 이어 묻기는 `--resume <id>`
// - 호출당 상한 [D1] $1.00 · 질문 상한 10분(X1 과 같다 · 012 [N3])
// - 첫 줄(init)을 받자마자 판정하고 어긋나면 SIGKILL(fail-closed · #634)
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { InitVerdict } from "./judge";

/** 012 [D1] 통합 층 호출당 상한 — fin 크론 · fit askAdvisor 기본값과 같다 */
export const CALL_BUDGET_USD = 1.0;
export const QUESTION_TIMEOUT_MS = 10 * 60_000;
const STDERR_MAX = 65_536;
/** stdout 상한 — 넘으면 끊는다(10분 동안 큰 도구 결과가 메모리에 쌓이지 않게 · 9-1 info 8) */
export const STDOUT_MAX_BYTES = 16 * 1024 * 1024;

export interface Pin {
  haiku: string;
  sonnet: string;
}

const PIN_SOURCES: ReadonlyArray<{ dir: string; constant: string }> = [
  { dir: "finance", constant: "PINNED_MODELS" },
  { dir: "fitness", constant: "PINNED_CLAUDE_MODELS" },
];

/** 두 앱 `src/lib/ai/models.ts` 의 고정 모델 — 다르면 던진다(앱과 같은 모델로만 답한다 · #255 · X1 S-4) */
export function readPins(appsDir: string): Pin {
  const got = PIN_SOURCES.map(({ dir, constant }) => {
    const src = fs.readFileSync(path.join(appsDir, dir, "src/lib/ai/models.ts"), "utf8");
    const at = src.indexOf(constant);
    const block = at < 0 ? "" : src.slice(at);
    const haiku = (block.match(/haiku:\s*['"]([^'"]+)['"]/) ?? [])[1];
    const sonnet = (block.match(/sonnet:\s*['"]([^'"]+)['"]/) ?? [])[1];
    if (!haiku || !sonnet) throw new Error(`${dir}: 모델 고정을 찾지 못했다`);
    return { haiku, sonnet };
  });
  if (got.some((p) => p.haiku !== got[0].haiku || p.sonnet !== got[0].sonnet)) throw new Error("두 앱 모델 고정이 다르다");
  return got[0];
}

/** 자식 env — DB·Discord 키는 넘기지 않는다 · 앱과 같은 핀 셋 · 자동 업데이트 끔 · MCP 도구 검색 끔(X1 #632 9-1) */
export function childEnv(pin: Pin, base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(base)) {
    if (!/^(DATABASE_URL|DISCORD_[A-Z0-9_]*|ANTHROPIC_MODEL|NOTIFY_[A-Z0-9_]*)$/.test(k)) env[k] = v;
  }
  return {
    ...env,
    DISABLE_AUTOUPDATER: "1",
    ANTHROPIC_DEFAULT_HAIKU_MODEL: pin.haiku,
    ANTHROPIC_DEFAULT_SONNET_MODEL: pin.sonnet,
    ANTHROPIC_SMALL_FAST_MODEL: pin.haiku,
    ENABLE_TOOL_SEARCH: "false",
  };
}

export interface CliArgsInput {
  model: string;
  system: string;
  mcpConfigPath: string;
  allow: readonly string[];
  budgetUsd: number;
  resume: string | null;
}

export function cliArgs(i: CliArgsInput): string[] {
  return [
    "--print", "--output-format", "stream-json", "--verbose",
    "--model", i.model,
    "--system-prompt", i.system,
    "--mcp-config", i.mcpConfigPath, "--strict-mcp-config",
    "--setting-sources", "project",
    "--allowedTools", i.allow.join(","),
    "--tools", "", // 내장·Web 도구 끔(MCP 는 남는다 · X1 §5-8 I-7)
    "--max-budget-usd", (Math.ceil(i.budgetUsd * 10_000) / 10_000).toFixed(4),
    "--permission-mode", "dontAsk",
    ...(i.resume ? ["--resume", i.resume] : []),
  ];
}

/** PATH 의 첫 실행 가능한 claude — 로컬은 run.sh 가 shim 을 맨 앞에 둔다(I-8 · 모델 호출 0) */
export function resolveClaude(env: NodeJS.ProcessEnv): string {
  for (const d of (env.PATH ?? "").split(path.delimiter).filter(Boolean)) {
    const f = path.join(d, "claude");
    try {
      fs.accessSync(f, fs.constants.X_OK);
      return f;
    } catch {
      // 다음
    }
  }
  throw new Error("claude 를 PATH 에서 찾지 못했다");
}

export interface RunInput {
  bin: string;
  /** bin 앞 인자(시험에서 node <가짜 CLI> 로 쓴다) */
  prefix?: readonly string[];
  args: readonly string[];
  env: NodeJS.ProcessEnv;
  cwd: string;
  prompt: string;
  checkInit: (e: unknown) => InitVerdict;
  timeoutMs?: number;
}

export interface RunOutput {
  out: string;
  stderrBytes: number;
  code: number | null;
  timedOut: boolean;
  overflow: boolean;
  init: InitVerdict | null;
  ms: number;
}

/** CLI 1회. 질문은 stdin 으로(인자·ps 에 남기지 않는다). init 이 어긋나면 첫 tool_use 를 기다리지 않고 SIGKILL. */
export function runCli(i: RunInput): Promise<RunOutput> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(i.bin, [...(i.prefix ?? []), ...i.args], { cwd: i.cwd, env: i.env, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let stderrBytes = 0;
    let timedOut = false;
    let overflow = false;
    let init: InitVerdict | null = null;
    const kill = (sig: NodeJS.Signals) => {
      child.kill(sig);
      setTimeout(() => child.kill("SIGKILL"), 5000).unref();
    };
    const judge = (line: string) => {
      let e: unknown = null;
      try {
        e = JSON.parse(line);
      } catch {
        // init 아님 → 형식
      }
      init = i.checkInit(e);
      if (!init.ok) kill("SIGKILL");
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill("SIGTERM");
    }, i.timeoutMs ?? QUESTION_TIMEOUT_MS);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (c: string) => {
      if (overflow) return;
      if (out.length + c.length > STDOUT_MAX_BYTES) {
        overflow = true;
        kill("SIGKILL");
        return;
      }
      out += c;
      if (!init && out.includes("\n")) judge(out.slice(0, out.indexOf("\n")));
    });
    child.stderr.on("data", (c: Buffer) => {
      stderrBytes = Math.min(STDERR_MAX, stderrBytes + c.length); // 원문은 남기지 않는다 — 크기만
    });
    child.on("error", () => undefined);
    child.stdin.on("error", () => undefined);
    child.stdin.end(i.prompt);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (!init) judge(out.split("\n")[0]);
      resolve({ out, stderrBytes, code, timedOut, overflow, init, ms: Date.now() - t0 });
    });
  });
}
