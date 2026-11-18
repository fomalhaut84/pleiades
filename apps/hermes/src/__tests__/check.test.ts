// 014 H-2 — 기동 전 점검 `hermes check`(#800)
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCheck } from "../check";

describe("runCheck", () => {
  let dir: string;
  let lines: string[];
  const out = (l: string) => lines.push(l);
  const env = (over: Record<string, string | undefined> = {}) =>
    ({ PORT: "4700", HERMES_STATE_DIR: path.join(dir, "state"), HERMES_REGISTRY: path.join(dir, "sources.json"), ...over }) as NodeJS.ProcessEnv;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "hermes-check-"));
    lines = [];
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  it("정상 — 레지스트리 없음(출처 0) · 웹훅 없음은 안내만 · rc 0", () => {
    expect(runCheck(env(), out)).toBe(0);
    expect(lines).toEqual([
      "대기열: WAL 예 · queued 0 · dead 0",
      "레지스트리: 출처 0 · 오류 아니오",
      "웹훅: 없음(받기만 · 게시 멈춤 — 플랫폼 설정에 키를 넣은 뒤 같은 명령)",
    ]);
  });

  it("레지스트리 오류 → rc 1", () => {
    writeFileSync(path.join(dir, "sources.json"), "{");
    expect(runCheck(env(), out)).toBe(1);
    expect(lines).toContain("레지스트리: 출처 0 · 오류 예");
  });

  it("PORT 아님 · 필수 env 없음 → rc 1", () => {
    expect(runCheck(env({ PORT: "abc" }), out)).toBe(1);
    expect(lines[0]).toBe("env: PORT 아님");
    lines = [];
    expect(runCheck(env({ HERMES_REGISTRY: undefined }), out)).toBe(1);
    expect(lines).toEqual(["env: HERMES_STATE_DIR · HERMES_REGISTRY 가 필요하다"]);
  });

  it("출력에 경로를 내지 않는다", () => {
    runCheck(env(), out);
    expect(lines.join("\n")).not.toContain(dir);
  });
});
