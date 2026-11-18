// 014 §3-D D1 — 출처 레지스트리 · 인증(H-1a · #791)
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRegistry, parseRegistry } from "../registry";

const KEY = "hrm_" + "aZ09".repeat(10) + "xYz"; // 4 + 43
const KEY2 = "hrm_" + "Q".repeat(43);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const src = (over: Record<string, unknown> = {}) => ({
  id: "orders",
  name: "주문",
  keySha256: sha(KEY),
  enabled: true,
  linkHosts: ["shop.example.com"],
  ...over,
});
const doc = (...sources: unknown[]) => JSON.stringify({ sources });
// 2026-11-18 12:00 KST
const NOW = Date.UTC(2026, 10, 18, 3, 0, 0);

describe("parseRegistry 검증", () => {
  it("정상 · 기본값(속도 30/분 · 링크 호스트 소문자)", () => {
    const r = parseRegistry(doc(src({ linkHosts: ["Shop.Example.COM"] })));
    expect(r.ok && r.sources[0]).toEqual({
      id: "orders",
      name: "주문",
      keySha256: sha(KEY),
      enabled: true,
      expires: null,
      linkHosts: ["shop.example.com"],
      ratePerMinute: 30,
    });
  });

  it.each([
    ["JSON 아님", "{"],
    ["sources 없음", "{}"],
    ["id 형식", doc(src({ id: "Orders!" }))],
    ["id 중복", doc(src(), src({ keySha256: sha(KEY2) }))],
    ["키 해시 형식", doc(src({ keySha256: "abc" }))],
    ["키 해시 중복", doc(src(), src({ id: "b" }))],
    ["이름에 discord", doc(src({ name: "my Discord bot" }))],
    ["이름에 clyde", doc(src({ name: "Clyde" }))],
    ["이름 길이", doc(src({ name: "" }))],
    ["enabled 타입", doc(src({ enabled: "yes" }))],
    ["expires 형식", doc(src({ expires: "2026/12/01" }))],
    ["속도 범위", doc(src({ ratePerMinute: 0 }))],
    ["링크 호스트 타입", doc(src({ linkHosts: "a.com" }))],
    ["모르는 칸", doc(src({ secret: "x" }))],
  ])("%s → 거부", (_name, text) => {
    expect(parseRegistry(text).ok).toBe(false);
  });
});

describe("createRegistry 인증", () => {
  let dir: string;
  let file: string;
  const write = (text: string, mtimeSec: number) => {
    writeFileSync(file, text);
    utimesSync(file, mtimeSec, mtimeSec);
  };

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "hermes-reg-"));
    file = path.join(dir, "sources.json");
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  it("맞는 키 → 출처", () => {
    write(doc(src()), 1000);
    const r = createRegistry(file).authenticate(`Bearer ${KEY}`, NOW);
    expect(r).toMatchObject({ ok: true, source: { id: "orders" } });
  });

  it.each([
    ["헤더 없음", undefined],
    ["Bearer 아님", `Basic ${KEY}`],
    ["형식이 다른 키", "Bearer abc"],
    ["모르는 키", `Bearer ${KEY2}`],
  ])("%s → 401", (_n, header) => {
    write(doc(src()), 1000);
    expect(createRegistry(file).authenticate(header, NOW)).toEqual({ ok: false, status: 401 });
  });

  it("꺼진 출처 → 403", () => {
    write(doc(src({ enabled: false })), 1000);
    expect(createRegistry(file).authenticate(`Bearer ${KEY}`, NOW)).toEqual({ ok: false, status: 403 });
  });

  it("만료 — 그날(KST)까지는 받고 다음 날부터 403", () => {
    write(doc(src({ expires: "2026-11-18" })), 1000);
    const reg = createRegistry(file);
    expect(reg.authenticate(`Bearer ${KEY}`, Date.UTC(2026, 10, 18, 14, 59)).ok).toBe(true); // 23:59 KST
    expect(reg.authenticate(`Bearer ${KEY}`, Date.UTC(2026, 10, 18, 15, 0))).toEqual({ ok: false, status: 403 });
  });

  it("파일이 없으면 출처 0 → 401", () => {
    expect(createRegistry(file).authenticate(`Bearer ${KEY}`, NOW)).toEqual({ ok: false, status: 401 });
  });

  it("잘못된 파일 → 503(fail-closed · 보내는 쪽이 재시도한다)", () => {
    write("{", 1000);
    expect(createRegistry(file).authenticate(`Bearer ${KEY}`, NOW)).toEqual({ ok: false, status: 503 });
  });

  it("수정 시각이 바뀌면 다시 읽는다 — 끄기 · 망가뜨리기 · 고치기", () => {
    write(doc(src()), 1000);
    const reg = createRegistry(file);
    expect(reg.authenticate(`Bearer ${KEY}`, NOW).ok).toBe(true);
    write(doc(src({ enabled: false })), 2000);
    expect(reg.authenticate(`Bearer ${KEY}`, NOW)).toEqual({ ok: false, status: 403 });
    write("{", 3000);
    expect(reg.authenticate(`Bearer ${KEY}`, NOW)).toEqual({ ok: false, status: 503 });
    write(doc(src()), 4000);
    expect(reg.authenticate(`Bearer ${KEY}`, NOW).ok).toBe(true);
  });

  it("상태 — 출처 수 · 오류 · 7일 안 만료 예정 id", () => {
    write(doc(src({ expires: "2026-11-24" }), src({ id: "w", keySha256: sha(KEY2), expires: "2026-12-31" })), 1000);
    expect(createRegistry(file).status(NOW)).toEqual({ sources: 2, error: false, expiringSoon: ["orders"] });
  });
});

describe("byId", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "hermes-reg2-"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });
  it("id 로 찾는다 · 없거나 오류면 null", () => {
    const file = path.join(dir, "s.json");
    writeFileSync(file, doc(src()));
    const reg = createRegistry(file);
    expect(reg.byId("orders")?.name).toBe("주문");
    expect(reg.byId("x")).toBeNull();
    writeFileSync(file, "{");
    utimesSync(file, 9999, 9999);
    expect(reg.byId("orders")).toBeNull();
  });
});
