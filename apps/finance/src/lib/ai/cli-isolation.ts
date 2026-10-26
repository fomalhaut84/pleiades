import { readFileSync } from 'fs'
import path from 'path'

/** pleiades 루트 감지 — 앱 디렉터리(`apps/<app>`)의 두 단계 위 `package.json` name */
const PLEIADES_ROOT_NAME = 'pleiades'

/**
 * #247 — pleiades 모노레포 안에서 돌면 cwd 상위의 루트 `CLAUDE.md`·`.claude/rules/` 가
 * 매 호출 컨텍스트에 붙는다 (로컬 실측 ~61k 토큰). haiku TA 가이드($0.10 한도)가
 * 컨텍스트만으로 한도에 닿아 `error_max_budget_usd` 로 전부 실패했다.
 *
 * 앱 디렉터리 두 단계 위가 pleiades 루트일 때만 그 둘을 `claudeMdExcludes` 로 뺀다 —
 * 앱 자신의 `CLAUDE.md`·rules(매매 방법론 포함)는 그대로라 전환 전 컨텍스트와 같다.
 * 루트가 아니면(단독 체크아웃 · 테스트 환경) 인자 없음.
 *
 * 반환값은 escape 전 인자 — `sh -c` 문자열에 넣는 호출부가 `shellEscape` 한다.
 * fit `src/lib/ai/cli-isolation.ts` 와 같은 규칙.
 */
export function monorepoExcludeArgs(
  appDir: string,
  readFile: (file: string) => string = (file) => readFileSync(file, 'utf-8'),
): string[] {
  const root = path.resolve(appDir, '..', '..')
  let name: unknown
  try {
    name = (JSON.parse(readFile(path.join(root, 'package.json'))) as { name?: unknown }).name
  } catch {
    // 루트 package.json 이 없거나 깨짐 = 모노레포 밖 — 제외할 상위 문서가 없다
    return []
  }
  if (name !== PLEIADES_ROOT_NAME) return []
  // 루트 메모리 파일 전부 — 지금은 CLAUDE.md·rules 만 있지만 나머지 둘이 생겨도 다시 붙지 않게 (#247 사전 리뷰 info)
  const claudeMdExcludes = [
    path.join(root, 'CLAUDE.md'),
    path.join(root, 'CLAUDE.local.md'),
    path.join(root, '.claude', 'CLAUDE.md'),
    path.join(root, '.claude', 'rules', '**'),
  ]
  return ['--settings', JSON.stringify({ claudeMdExcludes })]
}
