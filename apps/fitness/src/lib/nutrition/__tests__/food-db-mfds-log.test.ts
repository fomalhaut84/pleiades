// #610: 조회 미스(동점 거부 · 임계 미달)는 AI 폴백으로 가는 정상 흐름이다 — stderr(console.warn)로 내면
// 운영 수집기(008)와 배포 판정 C5 가 오류로 센다(dry-run 2026-11-12 · fit bot `실패` ×5 가 전부 이것).
// 미스는 stdout(console.info), 장애(HTTP · fetch · structural)는 stderr(console.warn) 그대로.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearMfdsCache, fetchMfdsFood } from "../food-db-mfds";

const row = (name: string, kcal: number) => ({ FOOD_NM_KR: name, AMT_NUM1: kcal });

function okFetch(items: unknown[]): typeof fetch {
  const body = JSON.stringify({ header: { resultCode: "00" }, body: { items, totalCount: items.length } });
  return (async () => new Response(body, { status: 200 })) as typeof fetch;
}

const mfdsCalls = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.map((c) => String(c[0])).filter((s) => s.startsWith("[mfds]"));

describe("fetchMfdsFood 로그 스트림 (#610)", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let info: ReturnType<typeof vi.spyOn>;

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

  it("동점 후보 거부는 info 로만 낸다", async () => {
    const hit = await fetchMfdsFood("김치찌개", {
      fetchImpl: okFetch([row("김치찌개_참치", 90), row("김치찌개_돼지고기", 120)]),
    });
    expect(hit).toBeNull();
    expect(mfdsCalls(info)).toEqual([expect.stringContaining("ambiguous tied match")]);
    expect(mfdsCalls(warn)).toEqual([]);
  });

  it("임계 미달(defensible match 없음)은 info 로만 낸다", async () => {
    const hit = await fetchMfdsFood("김치찌개", { fetchImpl: okFetch([row("된장국", 60)]) });
    expect(hit).toBeNull();
    expect(mfdsCalls(info)).toEqual([expect.stringContaining("no defensible match")]);
    expect(mfdsCalls(warn)).toEqual([]);
  });

  it("파싱 가능한 행이 없으면(structural) warn 그대로", async () => {
    await fetchMfdsFood("김치찌개", { fetchImpl: okFetch([{ FOOD_NM_KR: "김치찌개" }]) });
    expect(mfdsCalls(warn)).toEqual([expect.stringContaining("no parseable rows")]);
    expect(mfdsCalls(info)).toEqual([]);
  });

  it("HTTP 오류는 warn 그대로", async () => {
    const fail = (async () => new Response("down", { status: 503 })) as typeof fetch;
    await fetchMfdsFood("김치찌개", { fetchImpl: fail });
    expect(mfdsCalls(warn)).toEqual([expect.stringContaining("HTTP 503")]);
    expect(mfdsCalls(info)).toEqual([]);
  });
});
