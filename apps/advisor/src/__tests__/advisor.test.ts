// #680 — 코어 통합(가짜 MCP 두 도메인 · 가짜 CLI · 실제 domain.json · models.ts). 모델 호출 0.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Advisor, MESSAGES } from "../advisor";
import { LockState } from "../deploy-lock";
import { FakeMcp, startFakeMcp } from "./helpers/fake-mcp";
import { initLine, resultLine, toolResult, toolUse } from "./helpers/stream";

const APPS = path.resolve(__dirname, "../../..");
const FAKE_CLI = path.join(__dirname, "helpers", "fake-claude.mjs");
const KEY = "discord:100:200";
const FIN_TOOL = "mcp__myfinance__get_portfolio";
const FIT_TOOL = "mcp__myfitness__get_sleep";

let tmp: string;
let fin: FakeMcp;
let fit: FakeMcp;
let spec: string;
let cliLog: string;
let logs: string[];
let lock: LockState;

const setCli = (lines: unknown[], hang = false) => fs.writeFileSync(spec, JSON.stringify({ lines, hang }));
const happy = (allow = [FIN_TOOL, FIT_TOOL], keys = ["myfinance", "myfitness"]) =>
  setCli([initLine(allow, keys), toolUse("a", FIN_TOOL), toolResult("a"), toolUse("b", FIT_TOOL), toolResult("b"), resultLine()]);
const cliCalls = () => fs.readFileSync(cliLog, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { argv: string[]; input: string; db: boolean });

function advisor(over: Partial<ConstructorParameters<typeof Advisor>[0]> = {}) {
  const settingsDirs = { claudeDir: path.join(tmp, "claude"), managedDir: path.join(tmp, "managed") };
  return new Advisor({
    appsDir: APPS,
    privateRoot: path.join(tmp, "private"),
    env: { PATH: process.env.PATH, ADVISOR_MCP_PORT_FINANCE: String(fin.port), ADVISOR_MCP_PORT_FITNESS: String(fit.port),
      FAKE_CLI_SPEC: spec, FAKE_CLI_LOG: cliLog, DATABASE_URL: "postgresql://svc@prod/x" },
    claude: { bin: process.execPath, prefix: [FAKE_CLI] },
    settingsDirs,
    lockProbe: () => lock,
    log: (l) => logs.push(l),
    questionTimeoutMs: 5000,
    passEnv: ["FAKE_CLI_SPEC", "FAKE_CLI_LOG"], // 4b-3a2 B4 — 자식 env 가 허용 목록이라 시험 키는 명시해야 간다
    ...over,
  });
}

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "adv-core-"));
  fs.mkdirSync(path.join(tmp, "claude"));
  fs.mkdirSync(path.join(tmp, "managed"));
  spec = path.join(tmp, "spec.json");
  cliLog = path.join(tmp, "cli.log");
  logs = [];
  lock = "free";
  fin = await startFakeMcp({ tools: ["get_portfolio"], knowledge: "재무 지식 본문" });
  fit = await startFakeMcp({ tools: ["get_sleep"], knowledge: "건강 지식 본문" });
});
afterEach(async () => {
  await Promise.all([fin.close(), fit.close()]);
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("Advisor.ask — 정상", () => {
  it("두 도메인 지식을 실어 묻고 · 질문은 stdin · 자식 env 에 DB 없음 · 로그에 질문 원문 없음", async () => {
    happy();
    const r = await advisor().ask(KEY, "  이번 달 지출과 수면 관계?  ");
    expect(r).toMatchObject({ kind: "answer", text: "답입니다" });
    const [call] = cliCalls();
    expect(call.input).toBe("이번 달 지출과 수면 관계?");
    expect(call.db).toBe(false); // 셸 DATABASE_URL 이 있어도 자식에 넘기지 않는다
    const system = call.argv[call.argv.indexOf("--system-prompt") + 1];
    expect(system).toContain("## 도메인 지식 — 재무\n재무 지식 본문");
    expect(system).toContain("## 도메인 지식 — 건강\n건강 지식 본문");
    expect(call.argv[call.argv.indexOf("--allowedTools") + 1]).toBe(`${FIN_TOOL},${FIT_TOOL}`);
    expect(call.argv).not.toContain("--resume");
    const mcp = JSON.parse(fs.readFileSync(call.argv[call.argv.indexOf("--mcp-config") + 1], "utf8"));
    expect(mcp.mcpServers.myfinance.url).toBe(`http://127.0.0.1:${fin.port}/mcp/read`);
    const line = logs.find((l) => l.includes("status="))!;
    expect(line).toMatch(/status=완료 model=sonnet drift=판정 불가 cost=\$0\.1234 cap=\$1\.0000 turns=3 tools=myfinance:1\/1,myfitness:1\/1 outside=0 context=1200/);
    expect(logs.join("\n")).not.toContain("지출");
    expect(logs.join("\n")).not.toContain(KEY); // 채널·사용자 ID 는 해시로만
  });

  it("두 번째 질문은 같은 세션을 --resume 으로 이어 묻고 도메인을 다시 받지 않는다", async () => {
    happy();
    const a = advisor();
    await a.ask(KEY, "첫 질문");
    await a.ask(KEY, "둘째 질문");
    const calls = cliCalls();
    expect(calls[1].argv.slice(-2)).toEqual(["--resume", "11111111-2222-3333-4444-555555555555"]);
    expect(fin.calls.filter((c) => c === "tools/list")).toHaveLength(1);
    expect(a.reset(KEY)).toBe(MESSAGES.reset);
    await a.ask(KEY, "셋째");
    expect(cliCalls()[2].argv).not.toContain("--resume");
  });

  it("한 도메인이 실패하면 나머지로 답하고 첫 답에만 안내한다", async () => {
    await fit.close();
    fit = await startFakeMcp({ tools: ["get_sleep"], knowledge: null });
    setCli([initLine([FIN_TOOL], ["myfinance"]), toolUse("a", FIN_TOOL), toolResult("a"), resultLine()]);
    const a = advisor();
    const first = await a.ask(KEY, "q1");
    expect(first.text).toMatch(/^ℹ️ 이번 대화에서는 건강 데이터를 쓰지 못했어요\.\n\n답입니다$/);
    expect((await a.ask(KEY, "q2")).text).toBe("답입니다");
    expect(logs.some((l) => l.includes("domain=fit unavailable why=prompts/get 실패"))).toBe(true);
    const system = cliCalls()[0].argv[cliCalls()[0].argv.indexOf("--system-prompt") + 1];
    expect(system).toContain("## 이번 대화에서 쓸 수 없는 도메인\n건강");
  });
});

// 012 4b-3a2 (#695) — B5 지식 크기 가드 · B7 종료
describe("Advisor — 크기 가드 · 종료", () => {
  it("시스템 프롬프트가 상한을 넘으면 CLI 를 띄우지 않고 거부(system-too-large) · 세션을 남기지 않는다", async () => {
    happy();
    const a = advisor({ systemMaxBytes: 100 });
    expect(await a.ask(KEY, "q")).toMatchObject({ kind: "refused", reason: "system-too-large", text: MESSAGES.tooLarge });
    expect(fs.existsSync(cliLog)).toBe(false);
    expect(logs.join("\n")).toMatch(/refused system-too-large bytes=\d+/);
    expect(await advisor().ask(KEY, "q")).toMatchObject({ kind: "answer" }); // 기본 상한(100,000 B)이면 두 도메인은 통과
  });

  it("shutdown — 진행 중 CLI 를 끊고(시간 초과를 기다리지 않는다) · 그 뒤 질문은 거부", async () => {
    setCli([initLine([FIN_TOOL, FIT_TOOL], ["myfinance", "myfitness"])], true);
    const a = advisor({ questionTimeoutMs: 60_000 });
    const t0 = Date.now();
    const p = a.ask(KEY, "q");
    await new Promise((r) => setTimeout(r, 300));
    a.shutdown();
    expect(await p).toMatchObject({ kind: "failed" });
    expect(Date.now() - t0).toBeLessThan(8000);
    expect(await a.ask(KEY, "q2")).toMatchObject({ kind: "refused", reason: "shutting-down", text: MESSAGES.shuttingDown });
  });
});

describe("Advisor.ask — 거부 · 실패", () => {
  it("배포 중 · 락 판정 불가면 CLI 를 띄우지 않는다", async () => {
    happy();
    lock = "busy";
    expect(await advisor().ask(KEY, "q")).toMatchObject({ kind: "refused", reason: "deploying" });
    lock = "unknown";
    expect(await advisor().ask(KEY, "q")).toMatchObject({ kind: "refused", reason: "lock-unknown" });
    expect(fs.existsSync(cliLog)).toBe(false);
  });

  it("설정 범위에 hooks 가 있으면 거부(#635)", async () => {
    happy();
    fs.writeFileSync(path.join(tmp, "managed", "managed-settings.json"), JSON.stringify({ hooks: { Stop: [] } }));
    expect(await advisor().ask(KEY, "q")).toMatchObject({ kind: "refused", reason: "settings", text: MESSAGES.settings });
  });

  it("두 도메인 모두 실패면 거부", async () => {
    await Promise.all([fin.close(), fit.close()]);
    fin = await startFakeMcp({ tools: [], knowledge: "x" });
    fit = await startFakeMcp({ tools: ["get_sleep"], knowledge: "x", failToolsList: true });
    expect(await advisor().ask(KEY, "q")).toMatchObject({ kind: "refused", reason: "no-domain" });
  });

  it("빈 질문 · 너무 긴 질문", async () => {
    expect(await advisor().ask(KEY, "   ")).toMatchObject({ reason: "invalid" });
    expect(await advisor().ask(KEY, "가".repeat(4001))).toMatchObject({ reason: "invalid" });
  });

  it("상한 도달은 전용 문구 · 세션을 버린다", async () => {
    setCli([initLine([FIN_TOOL, FIT_TOOL], ["myfinance", "myfitness"]), resultLine({ subtype: "error_max_budget_usd", is_error: true })]);
    const a = advisor();
    expect(await a.ask(KEY, "q")).toMatchObject({ kind: "failed", text: MESSAGES.budget });
    happy();
    await a.ask(KEY, "q2");
    expect(cliCalls()[1].argv).not.toContain("--resume");
  });

  it("init 위반(목록 밖 도구)은 안전 문구 · 자식을 바로 끊는다", async () => {
    setCli([initLine([FIN_TOOL, FIT_TOOL, "Bash"], ["myfinance", "myfitness"]), resultLine()], true);
    const t0 = Date.now();
    expect(await advisor().ask(KEY, "q")).toMatchObject({ kind: "failed", text: MESSAGES.safety });
    expect(Date.now() - t0).toBeLessThan(4000);
  });

  it("허용 목록 밖 호출이 답에 있으면 답을 내지 않는다", async () => {
    setCli([initLine([FIN_TOOL, FIT_TOOL], ["myfinance", "myfitness"]), toolUse("x", "mcp__myfinance__add_transaction"), resultLine()]);
    expect(await advisor().ask(KEY, "q")).toMatchObject({ kind: "failed", code: "outside", text: MESSAGES.safety });
  });

  it("시간 초과는 일반 실패 문구", async () => {
    setCli([initLine([FIN_TOOL, FIT_TOOL], ["myfinance", "myfitness"])], true);
    expect(await advisor({ questionTimeoutMs: 300 }).ask(KEY, "q")).toMatchObject({ kind: "failed", code: "timeout", text: MESSAGES.failed });
  });

  it("init 뒤 hook 이벤트는 안전 문구(#635)", async () => {
    setCli([initLine([FIN_TOOL, FIT_TOOL], ["myfinance", "myfitness"]), { type: "system", subtype: "hook_started" }, resultLine()]);
    expect(await advisor().ask(KEY, "q")).toMatchObject({ kind: "failed", text: MESSAGES.safety, code: "violation:hook" });
  });

  it("CLI 실행 실패 · init 형식 오류는 안전 문구가 아니라 일반 실패(9-1 info 2)", async () => {
    happy();
    expect(await advisor({ claude: { bin: path.join(tmp, "no-claude") } }).ask(KEY, "q")).toMatchObject({ kind: "failed", text: MESSAGES.failed });
    setCli([{ ...initLine([FIN_TOOL, FIT_TOOL], ["myfinance", "myfitness"]), mcp_servers: [{ name: "myfinance", status: "pending" }, { name: "myfitness", status: "connected" }] }]);
    expect(await advisor().ask(KEY, "q")).toMatchObject({ kind: "failed", text: MESSAGES.failed });
  });

  it("이어 묻던 세션의 init 이 낡은 허용 목록으로 실패하면 도메인을 다시 받아 한 번 새로 묻는다(9-1 info 1)", async () => {
    happy();
    const a = advisor();
    await a.ask(KEY, "q1");
    // 배포로 fin 읽기 도구가 하나 늘었다 — 세션 시작 때 고정한 허용 목록에는 없고 CLI init 에는 보인다
    const NEW = "mcp__myfinance__get_prices";
    fin.opts.tools = ["get_portfolio", "get_prices"];
    setCli([initLine([FIN_TOOL, NEW, FIT_TOOL], ["myfinance", "myfitness"]), resultLine()]);
    const r = await a.ask(KEY, "q2");
    expect(r.kind).toBe("answer");
    const calls = cliCalls();
    expect(calls[1].argv).toContain("--resume");
    expect(calls[2].argv).not.toContain("--resume");
    expect(calls[2].argv[calls[2].argv.indexOf("--allowedTools") + 1]).toContain(NEW);
  });

  it("세션 id 를 받지 못하면 다음 질문은 새 세션(9-1 info 11)", async () => {
    setCli([initLine([FIN_TOOL, FIT_TOOL], ["myfinance", "myfitness"]), resultLine({ session_id: undefined })]);
    const a = advisor();
    await a.ask(KEY, "q1");
    await a.ask(KEY, "q2");
    expect(fin.calls.filter((c) => c === "tools/list")).toHaveLength(2);
  });

  it("컨텍스트(캐시 포함)가 100k 를 넘으면 다음 질문은 새 세션(9-1 M3)", async () => {
    setCli([initLine([FIN_TOOL, FIT_TOOL], ["myfinance", "myfitness"]),
      resultLine({ usage: { input_tokens: 5, cache_read_input_tokens: 100_000, cache_creation_input_tokens: 0 } })]);
    const a = advisor();
    await a.ask(KEY, "q1");
    await a.ask(KEY, "q2");
    expect(cliCalls()[1].argv).not.toContain("--resume");
  });

  it("처리 중에 온 질문은 기다리게 한다(전역 1 · [D4])", async () => {
    happy();
    const a = advisor();
    const first = a.ask(KEY, "q1");
    expect(await a.ask("discord:1:2", "q2")).toMatchObject({ kind: "refused", reason: "busy" });
    expect((await first).kind).toBe("answer");
  });
});
