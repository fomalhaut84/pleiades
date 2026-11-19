// #680 — 도메인 선언(실제 domain.json) · 읽기 경로 준비(가짜 MCP).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KNOWLEDGE_MAX_BYTES, loadDomains, parseDomain, prepareDomain } from "../domains";
import { FakeMcp, startFakeMcp } from "./helpers/fake-mcp";

const APPS = path.resolve(__dirname, "../../..");
const servers: FakeMcp[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

describe("loadDomains (실제 apps/*/domain.json · 계약 v0)", () => {
  it("fin · fit 두 도메인 · 기본 포트 · 쓰기 분류", () => {
    const { decls, broken } = loadDomains(APPS, {});
    expect(decls.map((d) => d.id)).toEqual(["fin", "fit"]); // #841 — 발견 결과 = 지금 저장소의 선언 전부 · 순서도 고정 목록과 같다
    expect(broken).toEqual([]);
    const [fin, fit] = decls;
    expect([fin.id, fin.serverKey, fin.keySuffix, fin.port]).toEqual(["fin", "myfinance", "FINANCE", 4210]);
    expect([fit.id, fit.serverKey, fit.keySuffix, fit.port]).toEqual(["fit", "myfitness", "FITNESS", 4301]);
    expect(fin.write.size).toBeGreaterThan(0);
  });

  it("포트는 ADVISOR_MCP_PORT_<SUFFIX> 가 이긴다 · 정수가 아니면 던진다", () => {
    expect(loadDomains(APPS, { ADVISOR_MCP_PORT_FINANCE: "4610" }).decls[0].port).toBe(4610);
    // #841 — 포트 오류는 그 제공자만 선언 오류로 뺀다(전체를 멈추지 않는다)
    const r = loadDomains(APPS, { ADVISOR_MCP_PORT_FITNESS: "abc" });
    expect(r.decls.map((d) => d.id)).toEqual(["fin"]);
    expect(r.broken).toEqual([{ id: "apps/fitness", why: expect.stringMatching(/포트/) }]);
  });

  it("계약·형식이 다르면 던진다", () => {
    const text = fs.readFileSync(path.join(APPS, "finance", "domain.json"), "utf8");
    expect(() => parseDomain(text.replace("pleiades-domain/v0", "v9"), {})).toThrow(/계약/);
    expect(() => parseDomain(JSON.stringify({ contract: "pleiades-domain/v0", id: "X" }), {})).toThrow(/형식/);
  });
});

describe("prepareDomain (가짜 읽기 경로)", () => {
  const decl = (port: number, write: string[] = ["add_transaction"]) =>
    ({ id: "fin", name: "재무", keySuffix: "FINANCE", serverKey: "myfinance", port, write: new Set(write) });
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
