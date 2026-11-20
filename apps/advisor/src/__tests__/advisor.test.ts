// #680 — 코어 통합(가짜 MCP 두 도메인 · 가짜 CLI · 실제 domain.json · models.ts). 모델 호출 0.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Advisor, BASE_SYSTEM_PROMPT, MESSAGES, initRetry } from "../advisor";
import { AnswerVerdict, InitVerdict } from "../judge";
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
    // 회귀 고정(#873 V-4b) — mcp 제공자만이면 mcp-config 는 V-4b 전과 바이트 동일(답 입력 무변경 · 키 순서 포함)
    expect(fs.readFileSync(call.argv[call.argv.indexOf("--mcp-config") + 1], "utf8")).toBe(JSON.stringify({ mcpServers: {
      myfinance: { type: "http", url: `http://127.0.0.1:${fin.port}/mcp/read` },
      myfitness: { type: "http", url: `http://127.0.0.1:${fit.port}/mcp/read` },
    } }, null, 2));
    const line = logs.find((l) => l.includes("status="))!;
    expect(line).toMatch(/status=완료 model=sonnet drift=판정 불가 cost=\$0\.1234 cap=\$1\.0000 turns=3 tools=myfinance:1\/1,myfitness:1\/1 outside=0 context=400/); // 1200 ÷ turns 3(#721)
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

  // 회귀: #695 9-1 info 1 — 세션 준비 중 종료가 오면 끊긴 신호를 든 채 CLI 를 새로 띄웠다
  it("세션 준비 중 종료 — CLI 를 띄우지 않고 거부", async () => {
    happy();
    const real = advisor();
    const a: Advisor = advisor({
      prepare: async (d) => {
        a.shutdown();
        return (await real.prepareAll()).find((r) => r.id === d.id)!;
      },
    });
    expect(await a.ask(KEY, "q")).toMatchObject({ kind: "refused", reason: "shutting-down" });
    expect(fs.existsSync(cliLog)).toBe(false);
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
    setCli([{ ...initLine([FIN_TOOL, FIT_TOOL], ["myfinance", "myfitness"]), mcp_servers: [{ name: "myfinance", status: "connected" }, { name: "myfitness", status: "zzz" }] }]);
    expect(await advisor().ask(KEY, "q")).toMatchObject({ kind: "failed", text: MESSAGES.failed, code: "format:알 수 없는 MCP 상태" });
    expect(cliCalls()).toHaveLength(1); // 알 수 없는 상태는 제외 · 재시도 없음(015 §4-3 — "MCP 미연결" 에서만)
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

  // 회귀: #711 · PR #710 Codex P2 — init 뒤 hook 은 모델 비용이 났을 수 있다 · 재시도가 판정·비용을 덮어썼다
  it("이어 묻던 세션의 init 뒤 hook 위반은 다시 묻지 않고 그 판정·비용을 그대로 낸다", async () => {
    happy();
    const a = advisor();
    await a.ask(KEY, "q1");
    setCli([initLine([FIN_TOOL, FIT_TOOL], ["myfinance", "myfitness"]), { type: "system", subtype: "hook_started" }, resultLine({ total_cost_usd: 0.42 })]);
    const r = await a.ask(KEY, "q2");
    expect(r).toMatchObject({ kind: "failed", text: MESSAGES.safety, code: "violation:hook" });
    expect(r.kind === "failed" && r.verdict?.cost).toBe(0.42);
    expect(cliCalls()).toHaveLength(2); // q1 + q2 — 재시도 없음
    expect(cliCalls()[1].argv).toContain("--resume");
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
      resultLine({ num_turns: 1, usage: { input_tokens: 5, cache_read_input_tokens: 100_000, cache_creation_input_tokens: 0 } })]);
    const a = advisor();
    await a.ask(KEY, "q1");
    await a.ask(KEY, "q2");
    expect(cliCalls()[1].argv).not.toContain("--resume");
  });

  // 회귀: #721 — 결과 usage 는 내부 턴 합산이다(fit 실측 14턴 ≈168k) · 합 그대로면 도구를 많이 쓴 한 번에 세션이 끊겼다
  it("도구 왕복이 많아 usage 합이 100k 를 넘어도 턴 평균이 작으면 세션을 잇는다", async () => {
    setCli([initLine([FIN_TOOL, FIT_TOOL], ["myfinance", "myfitness"]),
      resultLine({ num_turns: 14, usage: { input_tokens: 14_000, cache_read_input_tokens: 140_000, cache_creation_input_tokens: 14_000 } })]);
    const a = advisor();
    await a.ask(KEY, "q1");
    await a.ask(KEY, "q2");
    expect(cliCalls()[1].argv).toContain("--resume");
  });

  it("처리 중에 온 질문은 기다리게 한다(전역 1 · [D4])", async () => {
    happy();
    const a = advisor();
    const first = a.ask(KEY, "q1");
    expect(await a.ask("discord:1:2", "q2")).toMatchObject({ kind: "refused", reason: "busy" });
    expect((await first).kind).toBe("answer");
  });
});

// #858 · 015 V-3 — enabled:false 는 발견하되 준비하지 않고 모델 안내에도 넣지 않는다 · 핀은 선언의 models
describe("Advisor — 선언 끄기 · 핀 출처(fixture)", () => {
  it("꺼진 선언은 prepare 를 부르지 않고 decl 없이 '꺼짐' · 켜진 선언만 준비한다", async () => {
    const apps = path.join(tmp, "apps");
    const put = (dir: string, o: unknown) => {
      fs.mkdirSync(path.join(apps, dir, "src"), { recursive: true });
      fs.writeFileSync(path.join(apps, dir, "domain.json"), JSON.stringify(o));
      fs.writeFileSync(path.join(apps, dir, "src", "m.ts"), "export const P = { haiku: 'claude-h', sonnet: 'claude-s' }");
    };
    const decl = (id: string, enabled: boolean) => ({ contract: "pleiades-domain/v1", id, name: id, kind: "mcp", summary: "s", enabled,
      models: { file: "src/m.ts", constant: "P" }, mcp: { serverKey: `srv_${id}`, defaultPort: 1 }, tools: { read: ["a"], write: [], propose: [] } });
    put("on", decl("on", true));
    put("off", decl("off", false));
    const prepared: string[] = [];
    const a = advisor({ appsDir: apps, prepare: async (d) => (prepared.push(d.id), { id: d.id, ok: false, decl: d, why: "가짜" }) });
    const all = await a.prepareAll();
    expect(prepared).toEqual(["on"]);
    expect(all).toContainEqual({ id: "off", ok: false, decl: null, why: "꺼짐" });
  });

  it("핀을 선언한 도메인이 없으면 기동은 하고 질문은 no-domain 으로 거부한다(K-7 · V-3 전과 같은 결과)", async () => {
    const apps = path.join(tmp, "apps2");
    fs.mkdirSync(path.join(apps, "x"), { recursive: true });
    fs.writeFileSync(path.join(apps, "x", "domain.json"), JSON.stringify({ contract: "pleiades-domain/v1", id: "x", name: "x", kind: "local",
      summary: "s", local: { reader: "r" }, tools: { read: [], write: [], propose: [] } }));
    expect(await advisor({ appsDir: apps }).ask(KEY, "q")).toMatchObject({ kind: "refused", reason: "no-domain" });
    expect(logs.some((l) => l.endsWith("refused pin=none"))).toBe(true);
    expect(fs.existsSync(cliLog)).toBe(false);
  });
});

// #854 · 015 V-2c §4-3 — 질문당 init 재시도 1회 · "MCP 미연결" 에서만 제공자 제외 · violation:hook 재시도 없음
describe("Advisor — init 재시도(V-2c)", () => {
  const BOTH = ["myfinance", "myfitness"];
  const pendingInit = (pending: string[]) => ({
    ...initLine([FIN_TOOL, FIT_TOOL], BOTH),
    mcp_servers: BOTH.map((name) => ({ name, status: pending.includes(name) ? "pending" : "connected" })),
  });
  const runs = (...xs: unknown[][]) => fs.writeFileSync(spec, JSON.stringify({ runs: xs.map((lines) => ({ lines })) }));
  const argOf = (i: number, flag: string) => cliCalls()[i].argv[cliCalls()[i].argv.indexOf(flag) + 1];

  it("initRetry 판정 표(9-1 info)", () => {
    const v = (over: Partial<AnswerVerdict>) => ({ status: "init", code: "format:MCP 미연결", violation: false, ...over }) as AnswerVerdict;
    const unc = (unconnected: string[], over: Partial<InitVerdict> = {}): InitVerdict => ({ ok: false, kind: "format", why: "MCP 미연결", unconnected, ...over });
    expect(initRetry(v({}), unc(["myfitness"]), false)).toEqual({ exclude: ["myfitness"] });
    expect(initRetry(v({}), unc(["myfitness"]), true)).toEqual({ exclude: ["myfitness"] });
    expect(initRetry(v({ violation: true }), unc(["myfitness"]), false)).toBeNull(); // init 앞 hook 과 겹쳐도 제외 없음
    expect(initRetry(v({ violation: true }), unc(["myfitness"]), true)).toEqual({ exclude: [] });
    expect(initRetry(v({ code: "format:알 수 없는 MCP 상태" }), unc([], { why: "알 수 없는 MCP 상태" }), false)).toBeNull();
    expect(initRetry(v({}), unc([]), false)).toBeNull();
    expect(initRetry(v({ code: "init 없음" }), null, false)).toBeNull();
    expect(initRetry(v({ code: "init 없음" }), null, true)).toEqual({ exclude: [] });
    expect(initRetry(v({ code: "violation:hook", violation: true }), unc(["myfitness"]), true)).toBeNull();
    expect(initRetry(v({ status: "오류", code: "timeout" }), null, true)).toBeNull();
  });

  it("새 세션에서 한 제공자가 미연결이면 그 제공자를 빼고 한 번 더 묻고 · 첫 답에 안내한다", async () => {
    runs([pendingInit(["myfitness"])], [initLine([FIN_TOOL], ["myfinance"]), toolUse("a", FIN_TOOL), toolResult("a"), resultLine()]);
    const a = advisor();
    const r = await a.ask(KEY, "q1");
    expect(r).toMatchObject({ kind: "answer" });
    expect(r.text).toBe("ℹ️ 이번 대화에서는 건강 데이터를 쓰지 못했어요.\n\n답입니다"); // 맥락 소실 안내는 없다(새 세션)
    expect(cliCalls()).toHaveLength(2);
    expect(argOf(1, "--allowedTools")).toBe(FIN_TOOL);
    expect(Object.keys(JSON.parse(fs.readFileSync(argOf(1, "--mcp-config"), "utf8")).mcpServers)).toEqual(["myfinance"]);
    expect(argOf(1, "--system-prompt")).toContain("## 이번 대화에서 쓸 수 없는 도메인\n건강");
    expect(logs.some((l) => /retry=init excluded=1 resumed=false$/.test(l))).toBe(true);
    expect(logs.some((l) => l.includes("domain=fit unavailable why=MCP 미연결"))).toBe(true);
    // 다음 질문은 줄어든 세션을 이어 묻는다 — 안내는 첫 답에만
    expect((await a.ask(KEY, "q2")).text).toBe("답입니다");
    expect(cliCalls()[2].argv).toContain("--resume");
  });

  it("모든 제공자가 미연결이면 CLI 를 다시 띄우지 않고 no-domain(015 Q467 ②)", async () => {
    runs([pendingInit(BOTH)]);
    expect(await advisor().ask(KEY, "q")).toMatchObject({ kind: "refused", reason: "no-domain", text: MESSAGES.noDomain });
    expect(cliCalls()).toHaveLength(1);
  });

  it("재시도는 질문당 1회 — 다시 미연결이면 그대로 실패한다", async () => {
    runs([pendingInit(["myfitness"])], [{ ...initLine([FIN_TOOL], ["myfinance"]), mcp_servers: [{ name: "myfinance", status: "failed" }] }]);
    expect(await advisor().ask(KEY, "q")).toMatchObject({ kind: "failed", text: MESSAGES.failed, code: "format:MCP 미연결" });
    expect(cliCalls()).toHaveLength(2);
  });

  it("새 세션의 위반(목록 밖 도구)은 제외 · 재시도 없이 안전 문구 — 빼고 다시 열면 위반을 우회한다", async () => {
    runs([{ ...pendingInit(["myfitness"]), tools: [FIN_TOOL, FIT_TOOL, "Bash"] }]);
    expect(await advisor().ask(KEY, "q")).toMatchObject({ kind: "failed", text: MESSAGES.safety, code: "violation:목록 밖 도구" });
    expect(cliCalls()).toHaveLength(1);
  });

  it("새 세션의 init 뒤 hook 도 재시도 없음(#711)", async () => {
    runs([initLine([FIN_TOOL, FIT_TOOL], BOTH), { type: "system", subtype: "hook_started" }, resultLine({ total_cost_usd: 0.3 })]);
    expect(await advisor().ask(KEY, "q")).toMatchObject({ kind: "failed", code: "violation:hook" });
    expect(cliCalls()).toHaveLength(1);
  });

  it("이어 묻던 세션에서 미연결이면 빼고 새 세션으로 · 맥락 소실과 빠진 도메인을 함께 안내한다", async () => {
    const ok = [initLine([FIN_TOOL, FIT_TOOL], BOTH), resultLine()];
    runs(ok, [pendingInit(["myfinance"])], [initLine([FIT_TOOL], ["myfitness"]), resultLine()]);
    const a = advisor();
    await a.ask(KEY, "q1");
    const r = await a.ask(KEY, "q2");
    expect(r.text).toBe(`${MESSAGES.contextLost}\nℹ️ 이번 대화에서는 재무 데이터를 쓰지 못했어요.\n\n답입니다`);
    expect(cliCalls()[1].argv).toContain("--resume");
    expect(cliCalls()[2].argv).not.toContain("--resume");
    expect(argOf(2, "--allowedTools")).toBe(FIT_TOOL);
  });

  it("이어 묻던 세션의 다른 init 실패도 제외 없이 새 세션으로 · 맥락 소실 안내", async () => {
    const ok = [initLine([FIN_TOOL, FIT_TOOL], BOTH), resultLine()];
    runs(ok, [initLine([FIN_TOOL], ["myfinance", "other"])], ok);
    const a = advisor();
    await a.ask(KEY, "q1");
    expect((await a.ask(KEY, "q2")).text).toBe(`${MESSAGES.contextLost}\n\n답입니다`);
    expect(argOf(2, "--allowedTools")).toBe(`${FIN_TOOL},${FIT_TOOL}`);
    expect(logs.some((l) => /retry=init excluded=0 resumed=true$/.test(l))).toBe(true);
  });
});

// #841 · 015 V-2 — 발견 · 제공자 단위 격리. 답 입력은 {fin, fit} 에서 지금과 바이트 동일해야 한다.
describe("Advisor — 발견 · 선언 격리", () => {
  const fixtureApps = (extra: Record<string, string>, withDomains = true) => {
    const apps = path.join(tmp, "apps");
    for (const dir of ["finance", "fitness"]) {
      const files = ["src/lib/ai/models.ts", ...(withDomains ? ["domain.json"] : [])];
      for (const f of files) {
        fs.mkdirSync(path.dirname(path.join(apps, dir, f)), { recursive: true });
        fs.copyFileSync(path.join(APPS, dir, f), path.join(apps, dir, f));
      }
    }
    for (const [dir, text] of Object.entries(extra)) {
      fs.mkdirSync(path.join(apps, dir), { recursive: true });
      fs.writeFileSync(path.join(apps, dir, "domain.json"), text);
    }
    return apps;
  };
  const systemOf = () => {
    const [call] = cliCalls();
    return call.argv[call.argv.indexOf("--system-prompt") + 1];
  };

  it("{fin, fit} 시스템 프롬프트는 BASE + 재무 · 건강 순 지식 절 그대로(바이트 동일)", async () => {
    happy();
    await advisor().ask(KEY, "q");
    expect(systemOf()).toBe(`${BASE_SYSTEM_PROMPT}\n\n## 도메인 지식 — 재무\n재무 지식 본문\n\n## 도메인 지식 — 건강\n건강 지식 본문`);
  });

  it("깨진 선언이 섞여도 남은 도메인으로 답하고 · 모델 안내에는 넣지 않는다(B) · 로그에는 남는다", async () => {
    happy();
    const r = await advisor({ appsDir: fixtureApps({ broken: "{" }) }).ask(KEY, "q");
    expect(r).toMatchObject({ kind: "answer", text: "답입니다" });
    expect(systemOf()).toBe(`${BASE_SYSTEM_PROMPT}\n\n## 도메인 지식 — 재무\n재무 지식 본문\n\n## 도메인 지식 — 건강\n건강 지식 본문`);
    expect(logs.join("\n")).toMatch(/domain=apps\/broken unavailable why=선언 오류/);
  });

  it("선언이 전부 깨지면 지금과 같은 no-domain 거부", async () => {
    happy();
    const apps = fixtureApps({ broken: "{" }, false);
    expect(await advisor({ appsDir: apps }).ask(KEY, "q")).toMatchObject({ kind: "refused", reason: "no-domain", text: MESSAGES.noDomain });
  });
});
