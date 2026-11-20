// #880 · 015 V-5 — ops 리더(O2): 요약 · 이벤트 · 원문 필드 비노출 · 형식 불일치 · 인자 · 실제 호스트 번들로 질문 왕복.
// 고정값(src/local/__fixtures__/ops/)은 실제 수집기 출력이다 — 수집기 쪽 형식 시험(deploy/test_ops_format.py)이 같은 고정값을 본다.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Advisor } from "../advisor";
import { emptyTally } from "../local/fields";
import { FAILED_TEXT, MISMATCH_TEXT, callTool } from "../local/host";
import { EVENTS_MAX_ROWS, SINCE_MAX_H, kst, makeOpsReader } from "../local/ops";
import { READERS } from "../local/readers";
import { LOCAL_SRC, REPO_ROOT, bundle, cleanupBundles } from "./helpers/local";
import { initLine, resultLine, toolResult, toolUse } from "./helpers/stream";

const FIXTURE = path.join(LOCAL_SRC, "__fixtures__", "ops");
/** 고정값의 마지막 수집(2026-11-10 09:10 KST) 바로 뒤 */
const FIX_NOW = Date.parse("2026-11-10T09:11:00+09:00");
const reader = makeOpsReader(() => FIX_NOW);
const call = (tool: string, args: Record<string, unknown>, dir = FIXTURE) => {
  const err: string[] = [];
  const r = callTool(reader, dir, tool, args, (l) => err.push(l)) as { content: { text: string }[]; isError?: boolean };
  return { text: r.content[0].text, isError: r.isError === true, err };
};
const json = (tool: string, args: Record<string, unknown> = {}, dir = FIXTURE) => {
  const r = call(tool, args, dir);
  expect(r.isError, r.text).toBe(false);
  return JSON.parse(r.text);
};

let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ops-reader-"));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});
afterAll(cleanupBundles);

describe("ops_summary — state.json(O1 계산 필드)", () => {
  it("마지막 수집 · 열린 이상(kind state · open — 일일 요약과 같은 정의) · 최근순 · KST", () => {
    const s = json("ops_summary");
    const raw = JSON.parse(fs.readFileSync(path.join(FIXTURE, "state.json"), "utf8"));
    const open = Object.values(raw.fps as Record<string, { kind: string; open: boolean }>).filter((e) => e.kind === "state" && e.open);
    expect(s.lastRunAt).toBe(kst(raw.lastRunAt));
    expect(s.lastRunAt).toMatch(/^2026-11-10T09:10:00\.000\+09:00$/);
    expect(s.openCount).toBe(open.length);
    expect(s.open).toHaveLength(open.length);
    expect(Object.keys(s.open[0]).sort()).toEqual(["app", "first", "fp", "last", "role", "sev", "src"]);
    const lasts = s.open.map((e: { last: string }) => e.last);
    expect([...lasts].sort().reverse()).toEqual(lasts);
  });

  it("원문이 섞일 수 있는 필드(material · detail · scope)는 출력에 없다", () => {
    const text = call("ops_summary", {}).text;
    for (const k of ["material", "detail", "scope", "posted", "days", "warnDays"]) expect(text).not.toContain(`"${k}"`);
    expect(text).not.toContain(" · "); // material 은 "app · role · src · …" 로 이어 붙인 문자열이다
  });

  it("모르는 필드 · 깨진 파일 · fps 없음 = 도구 결과 실패 + stderr 개수 줄", () => {
    const raw = JSON.parse(fs.readFileSync(path.join(FIXTURE, "state.json"), "utf8"));
    const first = Object.keys(raw.fps)[0];
    fs.writeFileSync(path.join(tmp, "state.json"), JSON.stringify({ ...raw, fps: { ...raw.fps, [first]: { ...raw.fps[first], text: "원문" } } }));
    const r = call("ops_summary", {}, tmp);
    expect(r).toMatchObject({ text: MISMATCH_TEXT, isError: true });
    expect(r.err).toEqual(["[local-host] reader=ops tool=ops_summary mismatch unknown=1 missing=0 broken=0"]);
    fs.writeFileSync(path.join(tmp, "state.json"), "{");
    expect(call("ops_summary", {}, tmp)).toMatchObject({ isError: true, err: [expect.stringContaining("broken=1")] });
    fs.writeFileSync(path.join(tmp, "state.json"), JSON.stringify({ lastRunAt: 1 }));
    expect(call("ops_summary", {}, tmp)).toMatchObject({ isError: true, err: [expect.stringContaining("missing=1")] });
  });
});

describe("ops_events — events.jsonl(허용 목록)", () => {
  it("since_hours 안 · 최신순 · 허용 목록 필드만 · at 은 KST", () => {
    const all = json("ops_events", { since_hours: 24 });
    const lines = fs.readFileSync(path.join(FIXTURE, "events.jsonl"), "utf8").trim().split("\n");
    expect(all.count).toBe(lines.length);
    expect(all.rows[0].at).toMatch(/\+09:00$/);
    const ats = all.rows.map((r: { at: string }) => r.at);
    expect([...ats].sort().reverse()).toEqual(ats);
    const allowed = ["at", "type", "fp", "app", "role", "src", "sev", "count", "quiet", "blocked"];
    for (const r of all.rows) expect(Object.keys(r).every((k) => allowed.includes(k)), JSON.stringify(r)).toBe(true);
    expect(json("ops_events", { since_hours: 1 }).count).toBeLessThan(all.count); // 08:00 · 08:05 회는 1시간 밖
  });

  it("app 으로 거른다 · 없는 앱은 0행", () => {
    const fin = json("ops_events", { since_hours: 24, app: "ops" });
    expect(fin.count).toBeGreaterThan(0);
    expect(fin.rows.every((r: { app: string }) => r.app === "ops")).toBe(true);
    expect(json("ops_events", { since_hours: 24, app: "nope" }).count).toBe(0);
  });

  it(`행 상한 ${EVENTS_MAX_ROWS} — 넘으면 최신부터 자르고 truncated`, () => {
    const rows = Array.from({ length: EVENTS_MAX_ROWS + 30 }, (_, i) => JSON.stringify({ at: FIX_NOW - i * 1000, type: "obs", app: "fin", count: 1 }));
    fs.writeFileSync(path.join(tmp, "events.jsonl"), rows.join("\n") + "\n");
    const r = json("ops_events", {}, tmp);
    expect([r.count, r.rows.length, r.truncated]).toEqual([EVENTS_MAX_ROWS + 30, EVENTS_MAX_ROWS, true]);
    expect(r.rows[0].at).toBe(kst(FIX_NOW));
  });

  it("모르는 필드 · 깨진 줄 = 도구 결과 실패(원문 0)", () => {
    fs.writeFileSync(path.join(tmp, "events.jsonl"), `${JSON.stringify({ at: FIX_NOW, type: "obs", text: "원문 비밀" })}\n{"at":\n`);
    const r = call("ops_events", {}, tmp);
    expect(r).toMatchObject({ text: MISMATCH_TEXT, isError: true });
    expect(r.err).toEqual(["[local-host] reader=ops tool=ops_events mismatch unknown=1 missing=0 broken=1"]);
    expect(r.err.join("")).not.toContain("원문");
  });

  it.each<[string, Record<string, unknown>]>([
    ["since_hours 0", { since_hours: 0 }],
    [`since_hours ${SINCE_MAX_H + 1}`, { since_hours: SINCE_MAX_H + 1 }],
    ["since_hours 소수", { since_hours: 1.5 }],
    ["since_hours 문자열", { since_hours: "24" }],
    ["app 경로", { app: "../x" }],
    ["app 숫자", { app: 3 }],
  ])("잘못된 인자(%s) = 도구 결과 실패", (_n, args) => {
    expect(call("ops_events", args)).toMatchObject({ text: FAILED_TEXT, isError: true });
  });

  it("파일이 없으면 읽기 실패(코드만)", () => {
    expect(call("ops_events", {}, tmp)).toMatchObject({ isError: true, err: ["[local-host] reader=ops tool=ops_events error=ENOENT"] });
  });

  it("KST 변환", () => {
    expect(kst(Date.parse("2026-11-10T00:00:00Z"))).toBe("2026-11-10T09:00:00.000+09:00");
    expect(emptyTally()).toEqual({ unknown: 0, missing: 0, broken: 0 });
  });
});

describe("운영 레지스트리의 ops 리더 · 실제 호스트 번들로 질문 왕복", () => {
  let hostJs = "";
  beforeAll(() => {
    hostJs = bundle(path.join(LOCAL_SRC, "host-main.ts"));
  });

  it("운영 레지스트리의 ops 는 이 시험의 리더와 같은 도구 · 위치 규칙", () => {
    const prod = READERS.get("ops")!;
    expect(prod.tools.map((t) => t.name)).toEqual(reader.tools.map((t) => t.name));
    expect(prod.location("/r")).toBe(path.join("/r", "ops"));
  });

  it("deploy/ops/domain.json 발견 → 실제 호스트 번들 준비 → mcp-config stdio → 질문 → K-5 tools=pl_ops", async () => {
    // 저장소 모양: <tmp>/apps/<핀 선언> + <tmp>/deploy/ops/domain.json(실제 파일)
    const apps = path.join(tmp, "apps");
    fs.mkdirSync(path.join(apps, "pin", "src", "lib", "ai"), { recursive: true });
    fs.writeFileSync(path.join(apps, "pin", "domain.json"), JSON.stringify({
      contract: "pleiades-domain/v1", id: "pin", name: "핀", kind: "mcp", summary: "핀만", enabled: false,
      models: { file: "src/lib/ai/models.ts", constant: "PINNED_MODELS" }, mcp: { serverKey: "pin", defaultPort: 1 }, tools: { read: [], write: [], propose: [] },
    }));
    fs.writeFileSync(path.join(apps, "pin", "src", "lib", "ai", "models.ts"), 'export const PINNED_MODELS = { haiku: "h-1", sonnet: "s-1" };\n');
    fs.mkdirSync(path.join(tmp, "deploy", "ops"), { recursive: true });
    fs.copyFileSync(path.join(REPO_ROOT, "deploy", "ops", "domain.json"), path.join(tmp, "deploy", "ops", "domain.json"));
    const privateRoot = path.join(tmp, "private");
    fs.cpSync(FIXTURE, path.join(privateRoot, "ops"), { recursive: true });
    const spec = path.join(tmp, "spec.json");
    const cliLog = path.join(tmp, "cli.log");
    const tool = "mcp__pl_ops__ops_summary";
    fs.writeFileSync(spec, JSON.stringify({ lines: [initLine([tool, "mcp__pl_ops__ops_events"], ["pl_ops"]), toolUse("a", tool), toolResult("a"), resultLine()] }));
    fs.mkdirSync(path.join(tmp, "claude"));
    fs.mkdirSync(path.join(tmp, "managed"));
    const logs: string[] = [];
    const adv = new Advisor({
      appsDir: apps, privateRoot, env: { PATH: process.env.PATH, FAKE_CLI_SPEC: spec, FAKE_CLI_LOG: cliLog },
      claude: { bin: process.execPath, prefix: [path.join(__dirname, "helpers", "fake-claude.mjs")] },
      settingsDirs: { claudeDir: path.join(tmp, "claude"), managedDir: path.join(tmp, "managed") },
      lockProbe: () => "free", log: (l) => logs.push(l), questionTimeoutMs: 5000, passEnv: ["FAKE_CLI_SPEC", "FAKE_CLI_LOG"],
      localHost: { registry: READERS, command: process.execPath, prefix: [hostJs], initMaxMs: 10_000 },
    });
    expect(await adv.ask("discord:100:200", "지금 열린 이상 있어?")).toMatchObject({ kind: "answer", text: "답입니다" });
    const argv = (JSON.parse(fs.readFileSync(cliLog, "utf8").trim()) as { argv: string[] }).argv;
    const mcp = JSON.parse(fs.readFileSync(argv[argv.indexOf("--mcp-config") + 1], "utf8"));
    expect(mcp).toEqual({ mcpServers: { pl_ops: { type: "stdio", command: process.execPath, args: [hostJs, "--reader", "ops", "--dir", path.join(privateRoot, "ops")] } } });
    expect(argv[argv.indexOf("--allowedTools") + 1]).toBe(`${tool},mcp__pl_ops__ops_events`);
    const system = argv[argv.indexOf("--system-prompt") + 1];
    expect(system).toContain("## 도메인 지식 — 운영\n운영 — pleiades 서버 수집기의 요약");
    expect(system).not.toContain("핀만"); // enabled:false 는 안내에도 넣지 않는다
    expect(logs.find((l) => l.includes("status="))).toMatch(/tools=pl_ops:1\/1 outside=0 .* domains=1/);
  });
});
