/**
 * #510 후속 (Codex #511 4차 P2) — 격리 라벨 관심종목 행 제거 마이그레이션 구조 회귀.
 * 격리 행이 남으면 관심종목 알림 스캐너가 TIGER 시세로 SOL 라벨 알림을 낼 수 있다.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SQL_PATH = join(
  process.cwd(),
  'prisma/migrations/20261019100000_drop_quarantined_sol_watchlist/migration.sql',
)
const QUARANTINE = `'SOL 미국배당미국채혼합50 [#510 병합 필요]'`

function loadStatements(): string[] {
  return readFileSync(SQL_PATH, 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
}

describe('drop_quarantined_sol_watchlist migration (#510, Codex #511 P2)', () => {
  const statements = loadStatements()
  const idx = (prefix: string) => statements.findIndex((s) => s.startsWith(prefix))

  it('삭제 전에 옛 행 strategy·memo 를 490490.KS 행으로 옮긴다 (이전 설정 보존 · Codex #514 P2)', () => {
    expect(idx('UPDATE "Watchlist" keep')).toBeGreaterThanOrEqual(0)
    expect(idx('UPDATE "Watchlist" keep')).toBeLessThan(idx('DELETE FROM "Watchlist"'))
    const move = statements[idx('UPDATE "Watchlist" keep')]
    expect(move).toContain(`keep."ticker" = '490490.KS'`)
    expect(move).toContain(`stale."displayName" = ${QUARANTINE}`)
    expect(move).toContain(`coalesce(stale."strategy", '-')`)
    expect(move).toContain(`coalesce(stale."memo", '-')`)
  })

  it('관심종목 삭제는 격리 라벨 행에만 걸린다 (멱등 · 정상 472150.KS 관심종목 보존)', () => {
    const del = statements[idx('DELETE FROM "Watchlist"')]
    expect(del).toContain(`"ticker" = '472150.KS' AND "displayName" = ${QUARANTINE}`)
  })

  it('캐시 정리는 #510 이 만든 라벨 행 + 참조 없음일 때만', () => {
    const del = statements[idx('DELETE FROM "PriceCache"')]
    expect(del).toContain(`IN ('TIGER 배당커버드콜액티브', ${QUARANTINE})`)
    expect(del).toMatch(/NOT EXISTS \(SELECT 1 FROM "Holding"/)
    expect(del).toMatch(/NOT EXISTS \(SELECT 1 FROM "Watchlist"/)
    expect(del).toMatch(/NOT EXISTS \(SELECT 1 FROM "CustomStrategy" cs WHERE cs\."isActive"/)
  })
})
