// 회귀: #563 — Claude CLI 를 부르는 모든 소스가 격리 인자 (--strict-mcp-config) 를 쓰는지. 새 호출 경로가 빠뜨리면 실패한다.
// 서버 CLI 는 계정의 claude.ai 커넥터를 MCP 로 자동 로드한다 → 1회성 호출이 error_max_turns 로 실패 (2026-10-19 개선안 장애)
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CLAUDE_CLI_ISOLATION_ARGS, monorepoExcludeArgs } from "../cli-isolation";

const SRC = path.resolve(__dirname, "../../..");
/** Claude CLI 실행 — spawn · spawnFn · spawnSync · execFile 등, 실행 파일은 CLAUDE_BIN 또는 "claude" 리터럴 */
const RUN_CLAUDE = /\b(?:spawn|execFile)\w*\(\s*(?:CLAUDE_BIN\b|["']claude["'])/g;
const ISOLATION_SPREAD = /\.\.\.CLAUDE_CLI_ISOLATION_ARGS/g;
const count = (text: string, re: RegExp) => [...text.matchAll(re)].length;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "__tests__" || name === "generated" ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("Claude CLI 격리 인자", () => {
  it("--strict-mcp-config 를 담는다", () => {
    expect(CLAUDE_CLI_ISOLATION_ARGS).toContain("--strict-mcp-config");
  });

  it("Claude CLI 를 실행하는 모든 파일이 실행 횟수 이상 CLAUDE_CLI_ISOLATION_ARGS 를 인자에 넣는다", () => {
    const callers = sourceFiles(SRC)
      .map((f) => ({ file: path.relative(SRC, f), text: readFileSync(f, "utf8") }))
      .filter(({ text }) => count(text, RUN_CLAUDE) > 0);
    // 정규식이 아무것도 못 찾아 조용히 통과하지 않게
    expect(callers.length).toBeGreaterThanOrEqual(7);
    // 한 파일에 실행이 둘인데 한 곳만 격리하면 걸리게 — 실행 수 ≤ 격리 인자 수
    const missing = callers.filter(({ text }) => count(text, ISOLATION_SPREAD) < count(text, RUN_CLAUDE)).map(({ file }) => file);
    expect(missing).toEqual([]);
  });
});

// 회귀: #247 — 모노레포 안에서 루트 CLAUDE.md·.claude/rules 가 매 호출 컨텍스트에 붙어 비용·답변이 바뀌었다
describe("monorepoExcludeArgs", () => {
  const pkg = (name: string) => () => JSON.stringify({ name });

  it("두 단계 위가 pleiades 루트면 루트 CLAUDE.md·rules 를 claudeMdExcludes 로 넘긴다", () => {
    const args = monorepoExcludeArgs("/srv/pleiades-fit/apps/fitness", pkg("pleiades"));
    expect(args[0]).toBe("--settings");
    expect(JSON.parse(args[1])).toEqual({
      claudeMdExcludes: ["/srv/pleiades-fit/CLAUDE.md", "/srv/pleiades-fit/.claude/rules/**"],
    });
  });

  it("앱 자신의 CLAUDE.md 는 제외하지 않는다 (전환 전 컨텍스트 유지)", () => {
    const [, settings] = monorepoExcludeArgs("/srv/p/apps/fitness", pkg("pleiades"));
    expect(settings).not.toContain("apps/fitness");
  });

  it("루트 이름이 다르면 인자 없음", () => {
    expect(monorepoExcludeArgs("/srv/x/apps/fitness", pkg("myfitness"))).toEqual([]);
  });

  it("루트 package.json 이 없거나 깨졌으면 인자 없음", () => {
    expect(monorepoExcludeArgs("/srv/x/apps/fitness", () => { throw new Error("ENOENT"); })).toEqual([]);
    expect(monorepoExcludeArgs("/srv/x/apps/fitness", () => "{not json")).toEqual([]);
  });

  it("경로에 공백이 있어도 JSON 값 하나로 넘긴다 (spawn 인자 배열 · escape 없음)", () => {
    const args = monorepoExcludeArgs("/srv/my dir/apps/fitness", pkg("pleiades"));
    expect(args).toHaveLength(2);
    expect(JSON.parse(args[1]).claudeMdExcludes[0]).toBe("/srv/my dir/CLAUDE.md");
  });

  it("이 저장소 안에서는 실제로 제외 인자가 붙는다", () => {
    const appDir = path.resolve(__dirname, "../../../..");
    expect(monorepoExcludeArgs(appDir)[0]).toBe("--settings");
  });
});
