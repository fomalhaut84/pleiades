/**
 * #499 / Codex #501 P2 회귀 — 지수 PriceCache 정리 마이그레이션이 추적 중인 행을 지우지 않는지.
 *
 * refreshPrices() 는 Holding + Watchlist + 활성 CustomStrategy 의 cross_ticker 를 갱신 대상으로
 * 모으므로, 이들이 참조하는 지수 행은 유효 캐시다. 마이그레이션은 SQL 파일이라 DB 없이
 * 실행할 수 없어 문장 구조를 단언한다 (무조건 DELETE 로 되돌아가는 회귀 차단).
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SQL_PATH = join(
  process.cwd(),
  'prisma/migrations/20260917070947_cleanup_index_price_cache/migration.sql',
)

function loadStatements(): string[] {
  const raw = readFileSync(SQL_PATH, 'utf8')
  const withoutComments = raw
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
  return withoutComments
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
}

describe('cleanup_index_price_cache migration (#499, Codex #501 P2)', () => {
  const statements = loadStatements()

  it('DELETE 문 하나만 있고 지수 prefix 조건을 가진다', () => {
    expect(statements).toHaveLength(1)
    expect(statements[0]).toMatch(/^DELETE FROM "PriceCache"/)
    expect(statements[0]).toContain(`"ticker" LIKE '^%'`)
  })

  it('보유·관심종목·활성 커스텀 전략(cross_ticker 포함)이 참조하는 행은 제외한다', () => {
    const sql = statements[0]
    expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM "Holding"/)
    expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM "Watchlist"/)
    expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM "CustomStrategy" cs WHERE cs\."isActive"/)
    expect(sql).toContain(`cond->>'type' = 'cross_ticker'`)
    expect(sql).toContain(`cond->>'crossTicker'`)
  })

  it('무조건 DELETE (추적 여부 무시) 로 되돌아가지 않는다', () => {
    expect(statements[0]).not.toMatch(/^DELETE FROM "PriceCache"\s+WHERE\s+"ticker" LIKE '\^%'$/)
  })
})
