import { readFileSync } from "node:fs";
import path from "node:path";

/** pleiades 루트 감지 — 앱 디렉터리(`apps/<app>`)의 두 단계 위 `package.json` name */
const PLEIADES_ROOT_NAME = "pleiades";

/**
 * #247: pleiades 모노레포 안에서 돌면 cwd 상위의 루트 `CLAUDE.md`·`.claude/rules/` 가 매 호출 컨텍스트에 붙는다
 * (로컬 실측 ~61k 토큰 · 개발 규칙이 답변 컨텍스트에 섞인다). 앱 디렉터리 두 단계 위가 pleiades 루트일 때만
 * 그 둘을 `claudeMdExcludes` 로 뺀다 — 앱 자신의 `CLAUDE.md`·rules 는 그대로라 전환 전 컨텍스트와 같다.
 * 루트가 아니면(단독 체크아웃 · 테스트 환경) 인자 없음. spawn 인자 배열에 들어가므로 escape 하지 않는다.
 */
export function monorepoExcludeArgs(
  appDir: string,
  readFile: (file: string) => string = (file) => readFileSync(file, "utf8"),
): string[] {
  const root = path.resolve(appDir, "..", "..");
  let name: unknown;
  try {
    name = (JSON.parse(readFile(path.join(root, "package.json"))) as { name?: unknown }).name;
  } catch {
    // 루트 package.json 이 없거나 깨짐 = 모노레포 밖 — 제외할 상위 문서가 없다
    return [];
  }
  if (name !== PLEIADES_ROOT_NAME) return [];
  // 루트 메모리 파일 전부 — 지금은 CLAUDE.md·rules 만 있지만 나머지 둘이 생겨도 다시 붙지 않게 (#247 사전 리뷰 info)
  const claudeMdExcludes = [
    path.join(root, "CLAUDE.md"),
    path.join(root, "CLAUDE.local.md"),
    path.join(root, ".claude", "CLAUDE.md"),
    path.join(root, ".claude", "rules", "**"),
  ];
  return ["--settings", JSON.stringify({ claudeMdExcludes })];
}

// #563: Claude CLI 를 부르는 모든 곳에 붙이는 격리 인자.
// 서버 CLI 는 로그인 계정에 연결된 claude.ai 커넥터 (예: Claude Docs) 를 MCP 도구로 자동 로드한다. `--tools ""` 는 내장 도구만 끄므로
// 커넥터가 남고, 모델이 그것을 부르면 1회성 호출 (`--max-turns 1`) 은 error_max_turns 로 실패 · 어드바이저는 권한 거부로 턴을 낭비한다.
// `--strict-mcp-config` = `--mcp-config` 로 넘긴 서버만 사용 (넘기지 않으면 MCP 없음).
// #247: 호출부는 전부 `cwd: process.cwd()` 라 기준 디렉터리도 같은 값이다.
export const CLAUDE_CLI_ISOLATION_ARGS: readonly string[] = ["--strict-mcp-config", ...monorepoExcludeArgs(process.cwd())];
