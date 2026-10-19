/**
 * #510 회귀 — 'SOL 미국배당미국채혼합50' 티커 정정 마이그레이션이 멱등이고 범위가 맞는지.
 *
 * 서버 DB 일부가 수동 정정된 상태에서 적용되므로 모든 문장이 (잘못된 티커 + 해당 라벨) 조합에만
 * 걸려야 한다. SQL 파일이라 DB 없이 실행할 수 없어 문장 구조를 단언한다.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SQL_PATH = join(
  process.cwd(),
  'prisma/migrations/20261019090100_fix_sol_bond_mix_ticker/migration.sql',
)

const WRONG = `'472150.KS'`
const LABEL = `'SOL 미국배당미국채혼합50'`

function loadSql(): string {
  return readFileSync(SQL_PATH, 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
}

/** 가드용 DO 블록을 뺀 DML 문장들 */
function loadStatements(): string[] {
  return loadSql()
    .replace(/DO \$\$[\s\S]*?END \$\$;/, '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
}

describe('fix_sol_bond_mix_ticker migration (#510)', () => {
  const sql = loadSql()
  const statements = loadStatements()

  it('보유 충돌 가드가 모든 DML 보다 먼저 RAISE EXCEPTION 으로 중단한다 (Codex #511 P2 × 3)', () => {
    const guard = sql.indexOf('DO $$')
    expect(guard).toBeGreaterThanOrEqual(0)
    expect(sql.slice(0, guard)).not.toMatch(/\b(UPDATE|DELETE)\b/)
    expect(sql).toMatch(/DO \$\$[\s\S]*"accountId" = h\."accountId" AND x\."ticker" = '490490\.KS'[\s\S]*RAISE EXCEPTION '#510[\s\S]*END \$\$;/)
  })

  it('모든 문장이 잘못된 티커 + 라벨 조합에만 걸린다 (멱등 · 정상 472150.KS 보존)', () => {
    for (const s of statements) {
      expect(s).toContain(WRONG)
      expect(s).toContain(LABEL)
    }
  })

  it('보유 외에 거래·배당·스냅샷·관심종목 티커도 함께 정정한다', () => {
    for (const table of ['Trade', 'Dividend', 'HoldingSnapshot', 'Holding', 'Watchlist']) {
      expect(
        statements.some((s) => s.startsWith(`UPDATE "${table}"`) && s.includes(`SET "ticker" = '490490.KS'`)),
      ).toBe(true)
    }
  })

  it('관심종목은 정답 티커가 이미 있으면 정정을 건너뛴다 (ticker 유니크)', () => {
    const watchlist = statements.find((s) => s.startsWith('UPDATE "Watchlist" w SET "ticker"'))!
    expect(watchlist).toMatch(/NOT EXISTS \(SELECT 1 FROM "Watchlist" x WHERE x\."ticker" = '490490\.KS'\)/)
  })

  it('건너뛴 옛 관심종목은 알림 기준값을 memo 로 옮기고 비운 뒤 라벨 격리 (Codex #511 P2)', () => {
    const idx = statements.findIndex((s) => s.startsWith('UPDATE "Watchlist" SET'))
    expect(idx).toBeGreaterThan(statements.findIndex((s) => s.startsWith('UPDATE "Watchlist" w SET "ticker"')))
    const q = statements[idx]
    for (const field of ['targetBuy', 'entryLow', 'entryHigh']) {
      expect(q).toContain(`"${field}" = NULL`)
      expect(q).toContain(`coalesce("${field}"::text, '-')`)
    }
    expect(q).toContain(`"displayName" = 'SOL 미국배당미국채혼합50 [#510 병합 필요]'`)
    expect(statements.some((s) => s.startsWith('DELETE FROM "Watchlist"'))).toBe(false)
  })

  it('잘못된 라벨의 PriceCache 행은 참조가 없을 때만 삭제한다', () => {
    const del = statements.find((s) => s.startsWith('DELETE FROM "PriceCache"'))!
    expect(del).toMatch(/NOT EXISTS \(SELECT 1 FROM "Holding"/)
    expect(del).toMatch(/NOT EXISTS \(SELECT 1 FROM "Watchlist"/)
    expect(del).toMatch(/NOT EXISTS \(SELECT 1 FROM "CustomStrategy" cs WHERE cs\."isActive"/)
  })
})
