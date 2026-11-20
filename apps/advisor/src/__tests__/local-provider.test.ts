// #873 · 015 V-4b — `local` 제공자 연결: prepare 의 local 경로(H-R3) · mcp-config stdio 항목(H-R6) · probe 줄 · 기동 상한 · 답 입력 무변경.
// 시험 레지스트리 + 시험 호스트 번들(운영 레지스트리는 비어 있다). 모델 호출 0(가짜 CLI).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Advisor, mcpServerEntry } from "../advisor";
import { DomainReady, LocalDecl, LocalHostContext, localLaunch, prepareDomain } from "../domains";
import { LOCAL_INIT_MAX_MS } from "../local/host";
import { probeReport } from "../probe";
import { mcpDecl } from "./helpers/decl";
import { SAMPLE_FIXTURE, SLOW_START_MS, TEST_HOST_ENTRY, TEST_REGISTRY, bundle, cleanupBundles } from "./helpers/local";
import { initLine, resultLine, toolResult, toolUse } from "./helpers/stream";

const FAKE_CLI = path.join(__dirname, "helpers", "fake-claude.mjs");
const TOOL = "mcp__pl_sample__sample_status";

let hostJs = "";
beforeAll(() => {
  hostJs = bundle(TEST_HOST_ENTRY);
  expect(SLOW_START_MS).toBeGreaterThan(LOCAL_INIT_MAX_MS);
});
afterAll(cleanupBundles);

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "adv-local-"));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** 정상 경로는 상한을 넉넉히(CI 부하 · 9-1 info 1) — 운영 상한은 양성 대조가 initMaxMs 없이 본다 */
const ROOMY_MS = 10_000;
const ctx = (over: Partial<LocalHostContext> = {}): LocalHostContext => ({
  registry: TEST_REGISTRY, command: process.execPath, prefix: [hostJs], privateRoot: path.join(tmp, "private"), initMaxMs: ROOMY_MS, ...over,
});
const localDecl = (over: Partial<LocalDecl> = {}): LocalDecl => ({
  ...mcpDecl(), kind: "local", dir: "sample", origin: "apps/sample", id: "sample", name: "시험", summary: "시험 제공자 한 줄", keySuffix: null,
  serverKey: "pl_sample", reader: "sample", read: new Set(["sample_status", "sample_events"]), knowledge: false, ...over,
} as LocalDecl);
/** 리더 위치(privateRoot/sample)에 고정값을 놓는다 */
const placeFixture = (root: string, id = "sample") => fs.cpSync(SAMPLE_FIXTURE, path.join(root, id), { recursive: true });

describe("localLaunch — 실행 명령(H-R3 · H-R6 · 015 §3-1 원칙 1)", () => {
  it("레지스트리의 리더 · 허용 선언 위치가 맞으면 process.execPath + 번들 + --reader + --dir(리더가 정한 절대 위치)", () => {
    expect(localLaunch(localDecl(), ctx())).toEqual({
      command: process.execPath, args: [hostJs, "--reader", "sample", "--dir", path.join(tmp, "private", "sample")],
    });
  });

  it("레지스트리에 없는 리더 · 다른 위치의 선언이 그 리더를 고르면 null", () => {
    expect(localLaunch(localDecl({ reader: "ops" }), ctx())).toBeNull();
    expect(localLaunch(localDecl({ dir: "finance", origin: "apps/finance" }), ctx())).toBeNull(); // apps/finance 는 sample 리더의 허용 위치가 아니다
    expect(localLaunch(localDecl(), ctx({ registry: new Map() }))).toBeNull(); // 운영 레지스트리(빈)
  });
});

describe("prepareDomain — local 경로", () => {
  it("준비됨 — 호스트를 띄워 tools/list · 지식 = summary · 같은 명령을 돌려준다 · 기동 ms", async () => {
    const r = await prepareDomain(localDecl(), 5000, ctx());
    expect(r).toMatchObject({ ok: true, allow: [TOOL, "mcp__pl_sample__sample_events"], knowledge: "시험 제공자 한 줄", launch: localLaunch(localDecl(), ctx()) });
    expect((r as { initMs: number }).initMs).toBeGreaterThan(0);
  });

  it.each<[string, Partial<LocalDecl>, Partial<LocalHostContext>, string]>([
    ["리더가 레지스트리에 없다", { reader: "ops" }, {}, "reader-not-allowed"],
    ["허용 선언 위치가 아니다", { dir: "finance", origin: "apps/finance" }, {}, "reader-not-allowed"],
    ["실행 파일이 없다", {}, { command: "/nonexistent/node" }, "호스트 기동 실패"],
    ["등록 이름이 선언 read 밖", { read: new Set(["sample_status"]) }, {}, "선언에 없는 도구"],
    ["쓰기 분류 이름이 보인다", { write: new Set(["sample_events"]) }, {}, "쓰기 분류 도구가 읽기 경로에 있다"],
    ["knowledge: true 인데 호스트는 prompt 가 없다", { knowledge: true }, {}, "prompts/get 실패"],
  ])("%s → %s", async (_n, d, c, why) => {
    expect(await prepareDomain(localDecl(d), 5000, ctx(c))).toMatchObject({ ok: false, why });
  });

  it(`양성 대조 — 기동이 상한(${LOCAL_INIT_MAX_MS} ms)을 넘는 호스트는 쓰지 않는다(질문마다 init 첫 줄이 늦어진다 · #868)`, async () => {
    const r = await prepareDomain(localDecl({ dir: "sample_slow", origin: "apps/sample_slow", reader: "sample_slow" }), 5000, ctx({ initMaxMs: undefined })); // 운영 상한
    expect(r).toMatchObject({ ok: false, why: "기동 지연" });
  });
});

describe("mcp-config 항목 · probe 줄", () => {
  it("mcp 는 지금과 같은 http 항목 · local 은 prepare 와 같은 명령의 stdio 항목", async () => {
    const ready = await prepareDomain(localDecl(), 5000, ctx());
    if (!ready.ok) throw new Error(ready.why);
    expect(mcpServerEntry(ready)).toEqual({ type: "stdio", command: process.execPath, args: ready.launch!.args });
    const m = { id: "fin", ok: true as const, decl: mcpDecl({ port: 4210 }), allow: [], knowledge: "", toolBytes: 0 };
    expect(mcpServerEntry(m)).toEqual({ type: "http", url: "http://127.0.0.1:4210/mcp/read" });
  });

  it("probe — local 줄에 기동 ms · mcp 줄은 지금과 같다", () => {
    const all: DomainReady[] = [
      { id: "fin", ok: true, decl: mcpDecl(), allow: ["a"], knowledge: "k", toolBytes: 10 },
      { id: "sample", ok: true, decl: localDecl(), allow: ["a", "b"], knowledge: "s", toolBytes: 20, initMs: 412 },
    ];
    expect(probeReport("free", all).lines.slice(1, 3)).toEqual([
      "fin: 준비됨 · 읽기 도구 1 · 도구 정의 10 B · 지식 1 B",
      "sample: 준비됨 · 읽기 도구 2 · 도구 정의 20 B · 지식 1 B · 기동 412 ms",
    ]);
  });
});

describe("Advisor — local 제공자 질문 왕복(가짜 CLI)", () => {
  /** apps/sample/domain.json(v1 local · 모델 핀) — 핀이 있어야 질문을 받는다 */
  function appsWithSample(): string {
    const apps = path.join(tmp, "apps");
    fs.mkdirSync(path.join(apps, "sample", "src", "lib", "ai"), { recursive: true });
    fs.writeFileSync(path.join(apps, "sample", "domain.json"), JSON.stringify({
      contract: "pleiades-domain/v1", id: "sample", name: "시험", kind: "local", summary: "시험 제공자 한 줄",
      models: { file: "src/lib/ai/models.ts", constant: "PINNED_MODELS" }, local: { reader: "sample" },
      tools: { read: ["sample_status", "sample_events"], write: [], propose: [] },
    }));
    fs.writeFileSync(path.join(apps, "sample", "src", "lib", "ai", "models.ts"), 'export const PINNED_MODELS = { haiku: "h-1", sonnet: "s-1" };\n');
    return apps;
  }

  it("준비 → mcp-config stdio 항목 → 질문 → K-5 줄(tools=pl_sample)", async () => {
    const privateRoot = path.join(tmp, "private");
    placeFixture(privateRoot);
    const spec = path.join(tmp, "spec.json");
    const cliLog = path.join(tmp, "cli.log");
    fs.writeFileSync(spec, JSON.stringify({ lines: [initLine([TOOL, "mcp__pl_sample__sample_events"], ["pl_sample"]), toolUse("a", TOOL), toolResult("a"), resultLine()] }));
    fs.mkdirSync(path.join(tmp, "claude"));
    fs.mkdirSync(path.join(tmp, "managed"));
    const logs: string[] = [];
    const adv = new Advisor({
      appsDir: appsWithSample(), privateRoot, env: { PATH: process.env.PATH, FAKE_CLI_SPEC: spec, FAKE_CLI_LOG: cliLog },
      claude: { bin: process.execPath, prefix: [FAKE_CLI] }, settingsDirs: { claudeDir: path.join(tmp, "claude"), managedDir: path.join(tmp, "managed") },
      lockProbe: () => "free", log: (l) => logs.push(l), questionTimeoutMs: 5000, passEnv: ["FAKE_CLI_SPEC", "FAKE_CLI_LOG"],
      localHost: { registry: TEST_REGISTRY, command: process.execPath, prefix: [hostJs], initMaxMs: ROOMY_MS },
    });
    const r = await adv.ask("discord:100:200", "시험 상태는?");
    expect(r).toMatchObject({ kind: "answer", text: "답입니다" });
    const argv = (JSON.parse(fs.readFileSync(cliLog, "utf8").trim()) as { argv: string[] }).argv;
    const mcp = JSON.parse(fs.readFileSync(argv[argv.indexOf("--mcp-config") + 1], "utf8"));
    expect(mcp).toEqual({ mcpServers: { pl_sample: { type: "stdio", command: process.execPath, args: [hostJs, "--reader", "sample", "--dir", path.join(privateRoot, "sample")] } } });
    expect(argv[argv.indexOf("--allowedTools") + 1]).toBe(`${TOOL},mcp__pl_sample__sample_events`);
    expect(argv[argv.indexOf("--system-prompt") + 1]).toContain("## 도메인 지식 — 시험\n시험 제공자 한 줄");
    expect(logs.find((l) => l.includes("status="))).toMatch(/status=완료 .* tools=pl_sample:1\/1 outside=0 .* domains=1/);
  });

  it("운영 레지스트리(빈)면 local 선언은 쓰지 않는다 — 핀은 있어도 준비된 도메인 0 → no-domain", async () => {
    const logs: string[] = [];
    fs.mkdirSync(path.join(tmp, "claude"));
    fs.mkdirSync(path.join(tmp, "managed"));
    const adv = new Advisor({
      appsDir: appsWithSample(), privateRoot: path.join(tmp, "private"), env: { PATH: process.env.PATH },
      claude: { bin: "/nonexistent/claude" }, settingsDirs: { claudeDir: path.join(tmp, "claude"), managedDir: path.join(tmp, "managed") },
      lockProbe: () => "free", log: (l) => logs.push(l),
    });
    expect(await adv.ask("discord:100:200", "시험?")).toMatchObject({ kind: "refused", reason: "no-domain" });
    expect(logs).toContain("[advisor] domain=sample unavailable why=reader-not-allowed");
  });
});
