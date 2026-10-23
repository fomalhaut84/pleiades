// 회귀: #255 — 2026-10-23 서버 CLI 자동 업데이트로 `--model sonnet` 별칭이 다른 모델을 가리켰다 (pleiades#247).
// 등급 → 고정 ID · 보조 모델 env · 드리프트 판정 · Claude CLI 를 부르는 모든 파일이 고정 ID 와 env 를 쓰는지.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  claudeModelId,
  claudeSpawnEnv,
  detectModelDrift,
  PINNED_CLAUDE_MODELS,
  warnModelDrift,
  warnModelDriftFromStdout,
} from "../models";

describe("claudeModelId", () => {
  it("등급을 별칭이 아닌 정식 모델 ID 로 바꾼다", () => {
    expect(claudeModelId("sonnet")).toBe(PINNED_CLAUDE_MODELS.sonnet);
    expect(claudeModelId("haiku")).toBe(PINNED_CLAUDE_MODELS.haiku);
    for (const id of Object.values(PINNED_CLAUDE_MODELS)) {
      expect(id).toMatch(/^claude-/);
      expect(["sonnet", "haiku", "opus"]).not.toContain(id);
    }
  });
});

describe("claudeSpawnEnv", () => {
  it("CLI 보조 모델 별칭을 고정 ID 로 덮고 부모 env 는 유지한다", () => {
    const env = claudeSpawnEnv({ PATH: "/bin", ANTHROPIC_DEFAULT_SONNET_MODEL: "other" } as unknown as NodeJS.ProcessEnv);
    expect(env.PATH).toBe("/bin");
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe(PINNED_CLAUDE_MODELS.haiku);
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe(PINNED_CLAUDE_MODELS.sonnet);
    expect(env.ANTHROPIC_SMALL_FAST_MODEL).toBe(PINNED_CLAUDE_MODELS.haiku);
  });
});

describe("detectModelDrift", () => {
  const sonnet = PINNED_CLAUDE_MODELS.sonnet;

  it("고정 모델만 쓰면 드리프트 없음 (보조 haiku 포함)", () => {
    expect(detectModelDrift({ [sonnet]: {}, [PINNED_CLAUDE_MODELS.haiku]: {} }, sonnet)?.drift).toBe(false);
  });

  it("요청 모델 대신 다른 모델이 쓰이면 드리프트", () => {
    expect(detectModelDrift({ "claude-sonnet-9": {} }, sonnet)).toMatchObject({
      drift: true,
      missingExpected: true,
      unexpected: ["claude-sonnet-9"],
    });
  });

  it("보조 모델만 바뀌어도 드리프트", () => {
    expect(detectModelDrift({ [sonnet]: {}, "claude-haiku-9": {} }, sonnet)).toMatchObject({
      drift: true,
      missingExpected: false,
    });
  });

  it("modelUsage 가 없거나 비면 판정 불가 (null)", () => {
    expect(detectModelDrift(undefined, sonnet)).toBeNull();
    expect(detectModelDrift({}, sonnet)).toBeNull();
  });

  it("warnModelDrift 는 드리프트일 때만 경고한다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnModelDrift("t", { modelUsage: { [sonnet]: {} } }, "sonnet");
    warnModelDrift("t", { result: "x" }, "sonnet");
    expect(warn).not.toHaveBeenCalled();
    warnModelDrift("t", { modelUsage: { "claude-sonnet-9": {} } }, "sonnet");
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  // 회귀: #258 Codex P2 — 실패한 호출(is_error · 종료 코드 ≠ 0)의 JSON 에서도 드리프트를 본다
  it("warnModelDriftFromStdout 은 실패 결과 JSON 에서도 경고하고, JSON 이 아니면 조용히 넘긴다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnModelDriftFromStdout("t", "not json", "sonnet");
    warnModelDriftFromStdout("t", "", "sonnet");
    expect(warn).not.toHaveBeenCalled();
    warnModelDriftFromStdout("t", JSON.stringify({ is_error: true, modelUsage: { "claude-sonnet-9": {} } }), "sonnet");
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

const SRC = path.resolve(__dirname, "../../..");
/** Claude CLI 실행 — cli-isolation.test.ts 와 같은 정의 */
const RUN_CLAUDE = /\b(?:spawn|execFile)\w*\(\s*(?:CLAUDE_BIN\b|["']claude["'])/g;
const count = (text: string, re: RegExp) => [...text.matchAll(re)].length;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "__tests__" || name === "generated" ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("Claude CLI 호출이 고정 모델을 쓴다", () => {
  const callers = sourceFiles(SRC)
    .map((f) => ({ file: path.relative(SRC, f), text: readFileSync(f, "utf8") }))
    .filter(({ text }) => count(text, RUN_CLAUDE) > 0);

  it("호출 파일을 찾는다", () => {
    expect(callers.length).toBeGreaterThanOrEqual(7);
  });

  it("--model 다음에 별칭 문자열을 직접 쓰지 않는다", () => {
    const literal = /["']--model["'],\s*(?:\/\/[^\n]*\n\s*)*["'](?:sonnet|haiku|opus)["']/;
    expect(callers.filter(({ text }) => literal.test(text)).map(({ file }) => file)).toEqual([]);
  });

  it("실행마다 claudeModelId 와 claudeSpawnEnv 를 쓴다", () => {
    const missing = callers
      .filter(
        ({ text }) =>
          count(text, /claudeModelId\(/g) < count(text, RUN_CLAUDE) ||
          count(text, /env:\s*claudeSpawnEnv\(\)/g) < count(text, RUN_CLAUDE),
      )
      .map(({ file }) => file);
    expect(missing).toEqual([]);
  });
});

// 회귀: #255 사전 리뷰 major(어드바이저) · #258 Codex P2(1회성 호출 6곳) — 성공 분기에서만 경고하면
// 모델 교체가 실패로 드러날 때 감지하지 못한다. 모든 호출 파일에서 종료 코드 판정보다 앞에서 경고해야 한다.
describe("드리프트 경고 위치", () => {
  it("Claude CLI 를 부르는 모든 파일이 종료 코드 판정보다 앞에서 경고한다", () => {
    const callers = sourceFiles(SRC)
      .map((f) => ({ file: path.relative(SRC, f), text: readFileSync(f, "utf8") }))
      .filter(({ text }) => count(text, RUN_CLAUDE) > 0);
    expect(callers.length).toBeGreaterThanOrEqual(7);
    const late = callers
      .filter(({ text }) => {
        const warnAt = text.search(/warnModelDrift(?:FromStdout)?\(/);
        const exitAt = text.search(/if \(code !== 0\)/);
        return warnAt < 0 || exitAt < 0 || warnAt > exitAt;
      })
      .map(({ file }) => file);
    expect(late).toEqual([]);
  });
});
