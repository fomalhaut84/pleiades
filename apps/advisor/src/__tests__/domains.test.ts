// #680 — 도메인 선언(실제 domain.json) · 읽기 경로 준비(가짜 MCP).
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { KNOWLEDGE_MAX_BYTES, loadDomains, parseDomain, prepareDomain } from "../domains";
import { FakeMcp, startFakeMcp } from "./helpers/fake-mcp";

const APPS = path.resolve(__dirname, "../../..");
const servers: FakeMcp[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

describe("loadDomains (실제 apps/*/domain.json · 계약 v0)", () => {
  it("fin · fit 두 도메인 · 기본 포트 · 쓰기 분류", () => {
    const [fin, fit] = loadDomains(APPS, {});
    expect([fin.id, fin.serverKey, fin.keySuffix, fin.port]).toEqual(["fin", "myfinance", "FINANCE", 4210]);
    expect([fit.id, fit.serverKey, fit.keySuffix, fit.port]).toEqual(["fit", "myfitness", "FITNESS", 4301]);
    expect(fin.write.size).toBeGreaterThan(0);
  });

  it("포트는 ADVISOR_MCP_PORT_<SUFFIX> 가 이긴다 · 정수가 아니면 던진다", () => {
    expect(loadDomains(APPS, { ADVISOR_MCP_PORT_FINANCE: "4610" })[0].port).toBe(4610);
    expect(() => loadDomains(APPS, { ADVISOR_MCP_PORT_FITNESS: "abc" })).toThrow(/포트/);
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
