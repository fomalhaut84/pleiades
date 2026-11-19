// #839 · 015 V-1 — probe 판정 줄: 도구 정의 · 지식 · 시스템 합계 바이트와 S0 경고 줄(X2 · 막지 않는다).
import { describe, expect, it } from "vitest";
import { SYSTEM_MAX_BYTES, buildSystem } from "../advisor";
import { DomainDecl, DomainReady } from "../domains";
import { SYSTEM_WARN_BYTES, probeReport } from "../probe";

const decl = (id: string, name: string): DomainDecl =>
  ({ id, name, keySuffix: id.toUpperCase(), serverKey: id, port: 1, write: new Set<string>() });
const ok = (id: string, name: string, knowledge: string, toolBytes = 120): Extract<DomainReady, { ok: true }> =>
  ({ id, ok: true, decl: decl(id, name), allow: [`mcp__${id}__a`, `mcp__${id}__b`], knowledge, toolBytes });
const bad = (id: string, name: string): DomainReady => ({ id, ok: false, decl: decl(id, name), why: "읽기 경로 연결 실패" });
const bytes = (s: string) => Buffer.byteLength(s, "utf8");

describe("probeReport", () => {
  it("경고선은 상한의 75 %", () => {
    expect(SYSTEM_WARN_BYTES).toBe(Math.floor(SYSTEM_MAX_BYTES * 0.75));
  });

  it("준비된 도메인 줄은 기존 앞부분을 지키고 도구 정의 · 지식 바이트를 붙인다", () => {
    const ready = [ok("fin", "재무", "지식가", 2119), bad("fit", "건강")];
    const r = probeReport("busy", ready);
    expect(r.lines[0]).toBe("배포 락: busy");
    expect(r.lines[1]).toBe(`fin: 준비됨 · 읽기 도구 2 · 도구 정의 2119 B · 지식 ${bytes("지식가")} B`);
    expect(r.lines[2]).toBe("fit: 쓸 수 없음 · 읽기 경로 연결 실패");
  });

  it("시스템 합계는 실제 질문 경로의 buildSystem 바이트와 같다(빠진 도메인 안내 포함)", () => {
    const ready = [ok("fin", "재무", "지식"), bad("fit", "건강")];
    const want = bytes(buildSystem([ready[0] as Extract<DomainReady, { ok: true }>], [ready[1].decl!]));
    const r = probeReport("free", ready);
    expect(r.systemBytes).toBe(want);
    expect(r.lines).toContain(`시스템 프롬프트: ${want} B · 경고선 ${SYSTEM_WARN_BYTES} B · 상한 ${SYSTEM_MAX_BYTES} B`);
    expect(r.warn).toBe(false);
    expect(r.lines.some((l) => l.startsWith("경고:"))).toBe(false);
  });

  it("경고선 경계 — 같으면 경고 없음 · 1 B 넘으면 경고 줄(막지 않는다)", () => {
    // 기준선 = 지식이 빈 문자열일 때의 buildSystem 바이트(구분 문구를 복제하지 않는다 · 9-1 info)
    const base = bytes(buildSystem([ok("fin", "재무", "")], []));
    const fill = (n: number) => "a".repeat(n - base);
    const at = probeReport("free", [ok("fin", "재무", fill(SYSTEM_WARN_BYTES))]);
    expect(at.systemBytes).toBe(SYSTEM_WARN_BYTES);
    expect(at.warn).toBe(false);
    const over = probeReport("free", [ok("fin", "재무", fill(SYSTEM_WARN_BYTES + 1))]);
    expect(over.systemBytes).toBe(SYSTEM_WARN_BYTES + 1);
    expect(over.warn).toBe(true);
    expect(over.lines[over.lines.length - 1]).toMatch(/^경고: 시스템 프롬프트가 경고선을 넘었다/);
  });

  it("준비된 도메인이 없으면 합계 줄을 내지 않는다(질문 경로도 시작하지 않는다)", () => {
    const r = probeReport("free", [bad("fin", "재무"), bad("fit", "건강")]);
    expect(r.systemBytes).toBeNull();
    expect(r.lines.some((l) => l.startsWith("시스템 프롬프트"))).toBe(false);
  });
});

// #841 — 선언 오류 제공자(decl 없음)는 줄로만 · 시스템 합계의 빠진 도메인 안내에 넣지 않는다(B)
describe("probeReport — 선언 오류", () => {
  it("선언 오류 줄 · 합계는 선언 오류를 뺀 buildSystem", () => {
    const broken: DomainReady = { id: "apps/x", ok: false, decl: null, why: "선언 오류(JSON)" };
    const fin = ok("fin", "재무", "지식");
    const r = probeReport("free", [fin, broken]);
    expect(r.lines).toContain("apps/x: 쓸 수 없음 · 선언 오류(JSON)");
    expect(r.systemBytes).toBe(bytes(buildSystem([fin], [])));
  });
});
