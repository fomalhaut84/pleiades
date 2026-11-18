// 014 §3-D · §3-H — 출처 키 관리(H-2 · #800)
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRegistry, KEY_RE } from "../registry";
import { newKey, runKeyCli, sha256 } from "../key-cli";

describe("newKey", () => {
  it("hrm_ + base62 43 · 16진수 밖 글자 · 숫자 · 영문 — 100개 모두", () => {
    for (let i = 0; i < 100; i++) {
      const k = newKey();
      expect(k).toMatch(KEY_RE);
      expect(k.slice(4)).toMatch(/[g-zG-Z]/);
      expect(k).toMatch(/\d/);
    }
  });
  it("16진수만 나오면 다시 뽑는다", () => {
    let call = 0;
    // 첫 묶음: 모두 'a'(0x1a → 26 = 'a') — 16진수 · 숫자 없음 → 다시 · 둘째: 정상 난수
    const k = newKey((n) => (call++ === 0 ? Buffer.alloc(n, 26) : Buffer.from(Array.from({ length: n }, (_, i) => (i * 37 + 11) % 248))));
    expect(call).toBe(2);
    expect(k).toMatch(KEY_RE);
  });
});

describe("runKeyCli", () => {
  let dir: string;
  let file: string;
  let out: string[];
  let err: string[];
  const io = { out: (l: string) => out.push(l), err: (l: string) => err.push(l) };
  const run = (...args: string[]) => runKeyCli(args, file, io);
  const reg = () => JSON.parse(readFileSync(file, "utf8")) as { sources: Record<string, unknown>[] };

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "hermes-key-"));
    file = path.join(dir, "sources.json");
    out = [];
    err = [];
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  it("add — 키는 한 번 출력 · 파일에는 해시만 · 0600 · 받기 쪽이 그 키로 인증", () => {
    expect(run("add", "orders", "--name", "주문", "--expires", "2026-12-31", "--link-host", "shop.example.com", "--rate", "20")).toBe(0);
    const key = out.find((l) => KEY_RE.test(l))!;
    expect(key).toBeDefined();
    const text = readFileSync(file, "utf8");
    expect(text).not.toContain(key);
    expect(reg().sources[0]).toEqual({
      id: "orders",
      name: "주문",
      keySha256: sha256(key),
      enabled: true,
      expires: "2026-12-31",
      linkHosts: ["shop.example.com"],
      ratePerMinute: 20,
    });
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readdirSync(dir).filter((n) => n.includes(".tmp"))).toEqual([]);
    expect(createRegistry(file).authenticate(`Bearer ${key}`, Date.UTC(2026, 10, 18))).toMatchObject({ ok: true });
  });

  it("add — 잘못된 값은 쓰지 않는다(받기 쪽과 같은 검증)", () => {
    expect(run("add", "Bad!", "--name", "x")).toBe(1);
    expect(run("add", "a", "--name", "my discord")).toBe(1);
    expect(run("add", "a", "--name", "x", "--expires", "2026/1/1")).toBe(1);
    expect(err.join("\n")).toContain("쓰지 않았다");
    expect(out.some((l) => KEY_RE.test(l))).toBe(false); // 실패하면 키를 내지 않는다
    expect(() => readFileSync(file)).toThrow();
  });

  it("add 중복 · 사용법", () => {
    run("add", "a", "--name", "가");
    expect(run("add", "a", "--name", "나")).toBe(1);
    expect(run("add", "b")).toBe(2);
    expect(run("add", "b", "--name")).toBe(2);
    expect(run("add", "b", "--name", "x", "--bogus", "1")).toBe(2);
    expect(run()).toBe(2);
  });

  it("list — 해시를 내지 않는다", () => {
    run("add", "a", "--name", "가", "--link-host", "x.example");
    out = [];
    expect(run("list")).toBe(0);
    expect(out).toEqual(["a · 가 · 켜짐 · 만료 없음 · 링크 x.example · 분당 30"]);
    expect(out.join("")).not.toMatch(/[0-9a-f]{64}/);
  });

  it("disable · enable · remove · rotate", () => {
    run("add", "a", "--name", "가");
    const k1 = out.find((l) => KEY_RE.test(l))!;
    expect(run("disable", "a")).toBe(0);
    expect(createRegistry(file).authenticate(`Bearer ${k1}`, 0)).toEqual({ ok: false, status: 403 });
    expect(run("enable", "a")).toBe(0);
    out = [];
    expect(run("rotate", "a")).toBe(0);
    const k2 = out.find((l) => KEY_RE.test(l))!;
    const reg2 = createRegistry(file);
    expect(reg2.authenticate(`Bearer ${k1}`, 0)).toEqual({ ok: false, status: 401 });
    expect(reg2.authenticate(`Bearer ${k2}`, 0).ok).toBe(true);
    expect(run("remove", "a")).toBe(0);
    expect(reg().sources).toEqual([]);
    expect(run("remove", "a")).toBe(1);
  });

  // #811 — 시즌 연장: 키는 그대로 · 만료일만
  it("expires — 만료일 바꾸기 · none 으로 없애기 · 키 그대로", () => {
    run("add", "a", "--name", "가", "--expires", "2026-11-30");
    const key = out.find((l) => KEY_RE.test(l))!;
    out = [];
    expect(run("expires", "a", "2027-02-28")).toBe(0);
    expect(out).toEqual(["만료: a → 2027-02-28(키 그대로)"]);
    expect(reg().sources[0]).toMatchObject({ expires: "2027-02-28", keySha256: sha256(key) });
    expect(createRegistry(file).authenticate(`Bearer ${key}`, Date.UTC(2026, 11, 15)).ok).toBe(true);
    expect(run("expires", "a", "none")).toBe(0);
    expect(reg().sources[0].expires).toBeNull();
    expect(out.some((l) => KEY_RE.test(l))).toBe(false); // 키를 다시 내지 않는다
  });

  it("expires — 잘못된 날짜 · 없는 id · 값 없음", () => {
    run("add", "a", "--name", "가");
    expect(run("expires", "a", "2027/02/28")).toBe(1);
    expect(run("expires", "a", "2027-02-30")).toBe(1);
    expect(run("expires", "zz", "2027-02-28")).toBe(1);
    expect(run("expires", "a")).toBe(2);
    expect(run("expires", "a", "2027-01-01", "junk")).toBe(2);
    expect(reg().sources[0].expires ?? null).toBeNull(); // 실패한 명령은 파일을 바꾸지 않는다(add 때 칸 없음 그대로)
  });

  it("손으로 망가뜨린 레지스트리는 고치지 않고 멈춘다", () => {
    writeFileSync(file, "{");
    expect(run("add", "a", "--name", "가")).toBe(1);
    expect(readFileSync(file, "utf8")).toBe("{");
  });
});
