// #680 — 도메인 선언(실제 domain.json) · 읽기 경로 준비(가짜 MCP).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KNOWLEDGE_MAX_BYTES, loadDomains, parseDomain, prepareDomain } from "../domains";
import { mcpDecl } from "./helpers/decl";
import { FakeMcp, startFakeMcp } from "./helpers/fake-mcp";

const APPS = path.resolve(__dirname, "../../..");
const servers: FakeMcp[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

describe("loadDomains (실제 apps/*/domain.json · 계약 v1 · #858)", () => {
  it("fin · fit · ops 세 제공자 · 기본 포트 · 쓰기 분류", () => {
    const { decls, broken } = loadDomains(APPS, {});
    expect(decls.map((d) => d.id)).toEqual(["fin", "fit", "ops"]); // #841 — 발견 결과 = 지금 저장소의 선언 전부(id 순) · ops 는 apps 밖(#880)
    expect(broken).toEqual([]);
    const [fin, fit, ops] = decls;
    expect(ops).toMatchObject({ kind: "local", origin: "deploy/ops", dir: "", serverKey: "pl_ops", reader: "ops", knowledge: false, models: null });
    if (ops.kind !== "local") throw new Error("ops 는 local");
    expect([...ops.read]).toEqual(["ops_summary", "ops_events"]);
    expect([fin.origin, fit.origin]).toEqual(["apps/finance", "apps/fitness"]);
    expect(loadDomains(APPS, {}, []).decls.map((d) => d.id)).toEqual(["fin", "fit"]); // apps 밖 목록을 비우면 apps/* 만
    if (fin.kind !== "mcp" || fit.kind !== "mcp") throw new Error("fin · fit 는 mcp");
    expect([fin.id, fin.serverKey, fin.keySuffix, fin.port, fin.portKey]).toEqual(["fin", "myfinance", "FINANCE", 4210, "ADVISOR_MCP_PORT_FINANCE"]);
    expect([fit.id, fit.serverKey, fit.keySuffix, fit.port, fit.portKey]).toEqual(["fit", "myfitness", "FITNESS", 4301, "ADVISOR_MCP_PORT_FITNESS"]);
    expect(fin.write.size).toBeGreaterThan(0);
    // v1 이전(#858) — 지식 prompt 는 그대로 필수 · 핀은 선언에서 · 제안 분류 없음
    expect([fin.knowledge, fit.knowledge, fin.propose.size, fit.propose.size]).toEqual([true, true, 0, 0]);
    expect([fin.models, fit.models]).toEqual([{ file: "src/lib/ai/models.ts", constant: "PINNED_MODELS" }, { file: "src/lib/ai/models.ts", constant: "PINNED_CLAUDE_MODELS" }]);
    expect([fin.dir, fit.dir]).toEqual(["finance", "fitness"]);
  });

  it("포트는 ADVISOR_MCP_PORT_<SUFFIX> 가 이긴다 · 정수가 아니면 던진다", () => {
    expect(loadDomains(APPS, { ADVISOR_MCP_PORT_FINANCE: "4610" }).decls[0]).toMatchObject({ port: 4610 });
    // #841 — 포트 오류는 그 제공자만 선언 오류로 뺀다(전체를 멈추지 않는다)
    const r = loadDomains(APPS, { ADVISOR_MCP_PORT_FITNESS: "abc" });
    expect(r.decls.map((d) => d.id)).toEqual(["fin", "ops"]);
    expect(r.broken).toEqual([{ id: "apps/fitness", why: expect.stringMatching(/포트/) }]);
  });

  it("계약·형식이 다르면 던진다", () => {
    const text = fs.readFileSync(path.join(APPS, "finance", "domain.json"), "utf8");
    expect(() => parseDomain(text.replace("pleiades-domain/v1", "v9"), {})).toThrow(/계약/);
    expect(() => parseDomain(JSON.stringify({ contract: "pleiades-domain/v0", id: "X" }), {})).toThrow(/형식/);
    expect(() => parseDomain(JSON.stringify({ contract: "pleiades-domain/v1", id: "x" }), {})).toThrow(/형식/);
  });
});

describe("prepareDomain (가짜 읽기 경로)", () => {
  const decl = (port: number, write: string[] = ["add_transaction"]) => mcpDecl({ port, write: new Set(write) });
  const start = async (o: Parameters<typeof startFakeMcp>[0]) => {
    const s = await startFakeMcp(o);
    servers.push(s);
    return s;
  };

  it("도구는 접두를 붙여 허용 목록 · 지식 · 세션을 닫는다", async () => {
    const s = await start({ tools: ["get_portfolio", "get_prices"], knowledge: "지식", sse: true });
    const r = await prepareDomain(decl(s.port), 2000);
    expect(r).toMatchObject({ ok: true, allow: ["mcp__myfinance__get_portfolio", "mcp__myfinance__get_prices"], knowledge: "지식" });
    // #839 V-1 — 가짜 서버가 보낸 도구 정의의 JSON 바이트 합
    const defBytes = ["get_portfolio", "get_prices"].reduce((n, name) => n + Buffer.byteLength(JSON.stringify({ name, inputSchema: { type: "object" } }), "utf8"), 0);
    expect(r).toMatchObject({ toolBytes: defBytes });
    expect(s.calls).toEqual(["initialize", "notifications/initialized", "tools/list", "prompts/get", "DELETE"]);
  });

  it("쓰기 분류 도구가 읽기 경로에 보이면 그 도메인을 쓰지 않는다", async () => {
    const s = await start({ tools: ["get_portfolio", "add_transaction"], knowledge: "지식" });
    expect(await prepareDomain(decl(s.port), 2000)).toMatchObject({ ok: false, why: "쓰기 분류 도구가 읽기 경로에 있다" });
  });

  it("prompts/get 실패 · tools/list 실패 · 도구 0 · 지식 상한 · 연결 실패", async () => {
    const cases: [Parameters<typeof startFakeMcp>[0], string][] = [
      [{ tools: ["get_portfolio"], knowledge: null }, "prompts/get 실패"],
      [{ tools: ["get_portfolio"], knowledge: "x", failToolsList: true }, "tools/list 실패"],
      [{ tools: [], knowledge: "x" }, "읽기 도구 0"],
      [{ tools: ["get_portfolio"], knowledge: "가".repeat(KNOWLEDGE_MAX_BYTES) }, "지식 상한 초과"],
    ];
    for (const [o, why] of cases) {
      const s = await start(o);
      expect(await prepareDomain(decl(s.port), 2000)).toMatchObject({ ok: false, why });
    }
    const gone = await start({ tools: [], knowledge: "x" });
    await gone.close();
    servers.pop();
    expect(await prepareDomain(decl(gone.port), 2000)).toMatchObject({ ok: false, why: "읽기 경로 연결 실패" });
  });
});

// #841 · 015 V-2 — 자동 발견(apps/*/domain.json) · id 정렬 · 제공자 단위 격리
describe("loadDomains — 발견 · 격리(fixture)", () => {
  let root: string;
  const v0 = (id: string, serverKey: string, keySuffix: string, port = 4000) => JSON.stringify({
    contract: "pleiades-domain/v0", id, name: id.toUpperCase(), keySuffix, mcp: { serverKey, defaultPort: port }, tools: { write: [] },
  });
  const put = (dir: string, text: string | null) => {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    if (text !== null) fs.writeFileSync(path.join(root, dir, "domain.json"), text);
  };
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "adv-disc-"));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("선언 없는 디렉터리는 건너뛰고 · 디렉터리 이름이 아니라 id 순으로 정렬한다", () => {
    put("zeta", v0("aaa", "srv_a", "AAA"));
    put("alpha", v0("zzz", "srv_z", "ZZZ"));
    put("advisor", null);
    fs.writeFileSync(path.join(root, "README.md"), "파일은 무시");
    const r = loadDomains(root, {});
    expect(r.decls.map((d) => d.id)).toEqual(["aaa", "zzz"]);
    expect(r.broken).toEqual([]);
  });

  it("깨진 JSON · 계약 · 형식 오류는 그 제공자만 뺀다", () => {
    put("good", v0("good", "srv_g", "GOOD"));
    put("badjson", "{");
    put("contract", v0("c1", "srv_c", "CC").replace("pleiades-domain/v0", "v9"));
    put("shape", JSON.stringify({ contract: "pleiades-domain/v0", id: "X" }));
    const r = loadDomains(root, {});
    expect(r.decls.map((d) => d.id)).toEqual(["good"]);
    expect(r.broken.map((b) => b.id)).toEqual(["apps/badjson", "apps/contract", "apps/shape"]);
    for (const b of r.broken) expect(b.why).not.toBe("");
  });

  it("id · serverKey · keySuffix 가 겹치면 겹친 쪽 모두 뺀다", () => {
    put("a", v0("one", "srv_1", "ONE"));
    put("b", v0("one", "srv_2", "TWO"));
    put("c", v0("three", "srv_3", "THREE"));
    put("d", v0("four", "srv_3", "FOUR"));
    put("e", v0("five", "srv_5", "SAME"));
    put("f", v0("six", "srv_6", "SAME"));
    put("g", v0("ok", "srv_ok", "OK"));
    const r = loadDomains(root, {});
    expect(r.decls.map((d) => d.id)).toEqual(["ok"]);
    expect(r.broken.map((b) => b.id)).toEqual(["apps/a", "apps/b", "apps/c", "apps/d", "apps/e", "apps/f"]);
    expect(r.broken.every((b) => /겹친다/.test(b.why))).toBe(true);
  });

  it("발견 루트가 없으면 빈 결과(던지지 않는다)", () => {
    expect(loadDomains(path.join(root, "none"), {})).toEqual({ decls: [], broken: [] });
  });
});

// #858 · 015 §3-2 V-3 — 계약 v1 파서 · kind · 선택 요소 · 포트 키 규칙 · 준비 경로
describe("parseDomain — 계약 v1", () => {
  const v1 = (over: Record<string, unknown> = {}) => ({
    contract: "pleiades-domain/v1", id: "cal", name: "일정", kind: "mcp", summary: "일정 · 할 일",
    mcp: { serverKey: "mycal", defaultPort: 4400 }, tools: { read: ["get_events"], write: [], propose: [] }, ...over,
  });
  const parse = (o: unknown, env: NodeJS.ProcessEnv = {}) => parseDomain(JSON.stringify(o), env, "calendar");

  it("mcp — keySuffix 없으면 포트 키 = ADVISOR_MCP_PORT_<ID 대문자> · 지식은 선언했을 때만 · 끄기 표지", () => {
    const d = parse(v1());
    expect(d).toMatchObject({ kind: "mcp", dir: "calendar", keySuffix: null, port: 4400, portKey: "ADVISOR_MCP_PORT_CAL", knowledge: false, enabled: true, models: null });
    expect(parse(v1(), { ADVISOR_MCP_PORT_CAL: "4401" })).toMatchObject({ port: 4401 });
    expect(parse(v1({ keySuffix: "CALENDAR" }), { ADVISOR_MCP_PORT_CAL: "1" })).toMatchObject({ port: 4400, portKey: "ADVISOR_MCP_PORT_CALENDAR" });
    expect(parse(v1({ enabled: false, knowledge: true }))).toMatchObject({ enabled: false, knowledge: true });
  });

  it("local — serverKey = pl_<id> · reader · 포트 없음", () => {
    const d = parse(v1({ kind: "local", mcp: undefined, local: { reader: "ops" } }));
    expect(d).toMatchObject({ kind: "local", serverKey: "pl_cal", reader: "ops" });
    expect(d).not.toHaveProperty("port");
  });

  it("v1 은 fail-closed — 모르는 키 · 분류 누락 · 종류에 안 맞는 요소 · 요약 상한 · 핀 경로", () => {
    const bad: [unknown, RegExp][] = [
      [v1({ extra: 1 }), /모르는 키/],
      [v1({ tools: { read: ["a"], write: [] } }), /propose/],
      [v1({ tools: { read: ["a"], write: [], propose: ["p"] } }), /propose 를 쓰지 않는다/],
      [v1({ tools: { read: ["a"], write: ["a"], propose: [] } }), /중복/],
      [v1({ kind: "local", mcp: undefined, local: { reader: "ops" }, tools: { read: [], write: ["w"], propose: [] } }), /write/],
      [v1({ kind: "local", local: { reader: "ops" } }), /local\.reader/],
      [v1({ kind: "other" }), /kind/],
      [v1({ summary: "가".repeat(67) }), /summary/],
      [v1({ summary: "" }), /summary/],
      [v1({ enabled: "no" }), /enabled/],
      [v1({ models: { file: "../x/src/m.ts", constant: "P" } }), /models/],
      [v1({ models: { file: "/etc/m.ts", constant: "P" } }), /models/],
      [v1({ id: "a".repeat(58), kind: "local", mcp: undefined, local: { reader: "ops" } }), /길다/],
    ];
    for (const [o, re] of bad) expect(() => parse(o), JSON.stringify(o).slice(0, 80)).toThrow(re);
  });
});

describe("loadDomains — v1 키 규칙(fixture)", () => {
  let root: string;
  const put = (dir: string, o: unknown) => {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.writeFileSync(path.join(root, dir, "domain.json"), JSON.stringify(o));
  };
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "adv-v1-"));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  const tools = { read: ["get_x"], write: [], propose: [] };

  // 015 §3-2 K-0 AU2:30 — id `finance`(suffix 없음)의 포트 키 = fin keySuffix FINANCE 의 키 → 둘 다 뺀다
  it("포트 override 키가 겹치면 둘 다 뺀다 · v0 와 v1 사이에서도", () => {
    put("fin", { contract: "pleiades-domain/v0", id: "fin", name: "재무", keySuffix: "FINANCE", mcp: { serverKey: "myfinance", defaultPort: 1 }, tools: { write: [] } });
    put("other", { contract: "pleiades-domain/v1", id: "finance", name: "다른", kind: "mcp", summary: "s", mcp: { serverKey: "other", defaultPort: 2 }, tools });
    put("ok", { contract: "pleiades-domain/v1", id: "ok", name: "좋음", kind: "local", summary: "s", local: { reader: "ops" }, tools });
    const r = loadDomains(root, {});
    expect(r.decls.map((d) => d.id)).toEqual(["ok"]);
    expect(r.broken.map((b) => b.id)).toEqual(["apps/fin", "apps/other"]);
  });

  // #842 9-1 info — 심링크 디렉터리는 따라가지 않는다(체크아웃 밖을 가리킬 수 있다)
  it("심링크 디렉터리의 선언은 발견하지 않는다", () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "adv-out-"));
    try {
      fs.writeFileSync(path.join(outside, "domain.json"), JSON.stringify({ contract: "pleiades-domain/v1", id: "x", name: "x", kind: "local", summary: "s", local: { reader: "r" }, tools }));
      fs.symlinkSync(outside, path.join(root, "linked"), "dir");
      expect(loadDomains(root, {})).toEqual({ decls: [], broken: [] });
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe("prepareDomain — v1 준비 경로", () => {
  const servers2: FakeMcp[] = [];
  afterEach(async () => {
    await Promise.all(servers2.splice(0).map((s) => s.close()));
  });

  it("지식을 선언하지 않았으면 prompts/get 을 부르지 않고 summary 를 지식 절로", async () => {
    const s = await startFakeMcp({ tools: ["get_portfolio"], knowledge: null });
    servers2.push(s);
    const r = await prepareDomain(mcpDecl({ port: s.port, knowledge: false, summary: "재무 한 줄" }), 2000);
    expect(r).toMatchObject({ ok: true, knowledge: "재무 한 줄" });
    expect(s.calls).not.toContain("prompts/get");
  });

  it("제안 분류 도구가 읽기 경로에 보이면 그 도메인을 쓰지 않는다", async () => {
    const s = await startFakeMcp({ tools: ["get_portfolio", "propose_note"], knowledge: "지식" });
    servers2.push(s);
    expect(await prepareDomain(mcpDecl({ port: s.port, propose: new Set(["propose_note"]) }), 2000)).toMatchObject({ ok: false, why: "제안 분류 도구가 읽기 경로에 있다" });
  });

  it("local 선언 — 호스트 문맥이 없거나 운영 레지스트리에 그 리더가 없으면 reader-not-allowed(띄우지 않는다 · #873)", async () => {
    const local = { ...mcpDecl(), kind: "local" as const, serverKey: "pl_ops", reader: "ops", read: new Set(["ops_events"]) };
    expect(await prepareDomain(local, 2000)).toMatchObject({ ok: false, why: "reader-not-allowed", decl: local });
  });
});

// 회귀: #841 9-1 info — 파일 오류 사유는 코드만(절대경로를 로그에 남기지 않는다)
describe("loadDomains — 파일 오류 사유", () => {
  it("domain.json 이 디렉터리면 EISDIR 만 남는다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "adv-disc-"));
    try {
      fs.mkdirSync(path.join(root, "weird", "domain.json"), { recursive: true });
      const r = loadDomains(root, {});
      expect(r.broken).toEqual([{ id: "apps/weird", why: "선언 오류(EISDIR)" }]);
      expect(r.broken[0].why).not.toContain(root);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
