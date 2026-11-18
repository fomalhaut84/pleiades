// #750 — AI · 외부 응답 원문(사용자 음식 설명이 섞인다)을 로그에 남기지 않는다. #626 과 같은 형식(사유 코드 · 길이).
import { readFileSync } from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import type { spawn } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { estimateKcalFromText, parseKcalResponse, parseKcalResponseDetailed } from "../estimate-kcal";
import { extractFoodQuery, parseExtractFoodQueryResponse, parseExtractFoodQueryResponseDetailed } from "../extract-food-query";
import { clearMfdsCache, fetchMfdsFood } from "../food-db-mfds";

const src = (f: string) => readFileSync(path.resolve(__dirname, "..", f), "utf-8");

describe("parseKcalResponseDetailed 사유", () => {
  const item = (name: string, kcal: number | null) => ({ name, kcal });
  it.each([
    ["", "empty", 0],
    ["설명만 있다", "json", 0],
    ["[1,2]", "shape", 0],
    [JSON.stringify({ total_kcal: -1, items: [item("a", 1)] }), "total", 0],
    [JSON.stringify({ total_kcal: 100 }), "items", 0],
    [JSON.stringify({ total_kcal: 100, items: [item("a", 100), { kcal: 1 }] }), "item-shape", 2],
    [JSON.stringify({ total_kcal: 100, items: [item("a", null)] }), "kcal-null", 1],
    [JSON.stringify({ total_kcal: 500, items: [item("a", -200), item("b", 700)] }), "item-range", 2],
    [JSON.stringify({ total_kcal: 1000, items: [item("a", 100)] }), "sum", 1],
  ] as const)("%s → %s", (text, reason, items) => {
    expect(parseKcalResponseDetailed(text)).toEqual({ ok: false, reason, items });
    expect(parseKcalResponse(text)).toBeNull();
  });

  it("통과면 기존 함수와 같은 값", () => {
    const text = JSON.stringify({ total_kcal: 300, items: [item("밥", 300)], confidence: "high" });
    const r = parseKcalResponseDetailed(text);
    expect(r.ok).toBe(true);
    expect(r.ok && r.estimate).toEqual(parseKcalResponse(text));
    expect(parseKcalResponse(text)?.kcal).toBe(300);
  });
});

describe("parseExtractFoodQueryResponseDetailed 사유", () => {
  it.each([
    ["설명만", "json", 0],
    ['"x"', "shape", 0],
    ["{}", "items", 0],
    [JSON.stringify({ items: [{ query: "밥", quantityG: 200 }, { query: "물", quantityG: 3000 }] }), "item-shape", 2],
  ] as const)("%s → %s", (text, reason, items) => {
    expect(parseExtractFoodQueryResponseDetailed(text)).toEqual({ ok: false, reason, items });
    expect(parseExtractFoodQueryResponse(text)).toBeNull();
  });

  it("통과면 항목 그대로", () => {
    const text = JSON.stringify({ items: [{ query: "밥", quantityG: 200, explicit: true }] });
    expect(parseExtractFoodQueryResponse(text)).toEqual([{ query: "밥", quantityG: 200, explicit: true }]);
    expect(parseExtractFoodQueryResponseDetailed(text)).toEqual({ ok: true, items: [{ query: "밥", quantityG: 200, explicit: true }] });
  });
});

describe("실패 로그에 원문이 없다", () => {
  it("kcal · extract-food-query 는 응답 원문을 자르지 않고 사유 · 길이만", () => {
    for (const f of ["estimate-kcal.ts", "extract-food-query.ts"]) {
      const s = src(f);
      expect(s).not.toMatch(/AI 응답 파싱[^`]*\$\{text\.slice/);
      expect(s).toMatch(/AI 응답 파싱[^`]*reason=\$\{parsed\.reason\} len=\$\{text\.length\}/);
    }
  });
});

describe("MFDS 로그에 질의어 · 오류 본문이 없다", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let info: ReturnType<typeof vi.spyOn>;
  const QUERY = "어머니표 비밀 김치찌개";
  const logged = () => [...warn.mock.calls, ...info.mock.calls].map((c) => c.map(String).join(" ")).join("\n");

  beforeEach(() => {
    vi.stubEnv("MFDS_API_KEY", "test-key");
    clearMfdsCache();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    info = vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("HTTP 오류 — 본문 대신 길이 · 질의어 대신 길이", async () => {
    const fail = (async () => new Response("SECRET-BODY", { status: 503 })) as typeof fetch;
    await fetchMfdsFood(QUERY, { fetchImpl: fail });
    expect(logged()).toContain(`HTTP 503 for qlen=${QUERY.length} body_len=11`);
    expect(logged()).not.toContain("SECRET-BODY");
    expect(logged()).not.toContain(QUERY);
  });

  it("미스 · fetch 실패도 질의어를 남기지 않는다", async () => {
    const body = JSON.stringify({ header: { resultCode: "00" }, body: { items: [{ FOOD_NM_KR: "된장국", AMT_NUM1: 60 }], totalCount: 1 } });
    await fetchMfdsFood(QUERY, { fetchImpl: (async () => new Response(body, { status: 200 })) as typeof fetch });
    await fetchMfdsFood(QUERY + "2", { fetchImpl: (async () => { throw new Error("net"); }) as typeof fetch });
    expect(logged()).toContain("no defensible match for qlen=");
    expect(logged()).toContain("fetch 실패 for qlen=");
    expect(logged()).not.toContain(QUERY);
  });
});

// 회귀: #750 9-1 major — node 24 JSON.parse 오류 문구에 입력 원문이 들어간다
describe("JSON 이 아닌 출력 · 본문도 로그에 남지 않는다", () => {
  const RAW = "어머니표 비밀 김치찌개를 먹었다";
  let warn: ReturnType<typeof vi.spyOn>;
  const logged = () => warn.mock.calls.map((c: unknown[]) => c.map(String).join(" ")).join("\n");
  const cliSpawn = (stdout: string) =>
    ((() => {
      const child = Object.assign(new EventEmitter(), {
        stdin: { end: () => undefined, write: () => true, on: () => undefined },
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
      });
      setImmediate(() => {
        child.stdout.emit("data", Buffer.from(stdout));
        child.emit("close", 0);
      });
      return child;
    }) as unknown as typeof spawn);

  beforeEach(() => {
    vi.stubEnv("MFDS_API_KEY", "test-key");
    clearMfdsCache();
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("kcal · extract-food-query CLI 바깥 JSON 실패 — 이름 · 길이만", async () => {
    expect(await estimateKcalFromText({ description: "밥" }, { spawnImpl: cliSpawn(RAW) })).toBeNull();
    expect(await extractFoodQuery({ description: "밥" }, { spawnImpl: cliSpawn(RAW) })).toBeNull();
    expect(logged()).toContain(`[kcal] outer JSON parse 실패: SyntaxError len=${RAW.length}`);
    expect(logged()).toContain(`[extract-food-query] outer JSON parse 실패: SyntaxError len=${RAW.length}`);
    expect(logged()).not.toContain("어머니");
  });

  it("MFDS 본문 JSON 실패 — 이름 · 길이만", async () => {
    await fetchMfdsFood("밥", { fetchImpl: (async () => new Response(RAW, { status: 200 })) as typeof fetch });
    expect(logged()).toContain(`JSON parse 실패 for qlen=1: SyntaxError body_len=${RAW.length}`);
    expect(logged()).not.toContain("어머니");
  });
});
