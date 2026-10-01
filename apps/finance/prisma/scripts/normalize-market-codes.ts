/**
 * market 코드 정규화 마이그레이션 스크립트 (Phase 25-A, #281)
 *
 * 기존 DB의 PriceCache, Watchlist, Holding, Trade의 market 필드를
 * normalizeMarket()으로 일괄 변환한다.
 *
 * 사용법:
 *   tsx prisma/scripts/normalize-market-codes.ts --dry-run   # 변경 row 수만 출력
 *   tsx prisma/scripts/normalize-market-codes.ts             # 실제 적용
 *
 * 설계:
 *   - 테이블별로 별도 트랜잭션 (락 경합 최소화, 부분 실패 격리)
 *   - 배치 단위 업데이트 (BATCH_SIZE)
 *   - 명시 timeout으로 인터랙티브 트랜잭션 기본 5초 초과 방지
 *   - normalize 결과가 OTHER인 row는 skip + 경고 (수동 확인 대상)
 */

import { PrismaClient, Prisma } from '@prisma/client'
import { normalizeMarket } from '../../src/lib/market-hours'

const prisma = new PrismaClient()
type TxClient = Prisma.TransactionClient

const BATCH_SIZE = 500
const TX_TIMEOUT_MS = 120_000 // 2분

interface TableStats {
  scanned: number
  changed: number
  unchanged: number
  other: number
  otherSamples: { key: string; raw: string }[]
}

function emptyStats(): TableStats {
  return { scanned: 0, changed: 0, unchanged: 0, other: 0, otherSamples: [] }
}

interface Row {
  pk: string
  ticker: string
  market: string
}

function classifyRow(row: Row, stats: TableStats): string | null {
  stats.scanned++
  const normalized = normalizeMarket(row.market, row.ticker)
  if (normalized === 'OTHER') {
    stats.other++
    if (stats.otherSamples.length < 5) {
      stats.otherSamples.push({ key: row.ticker, raw: row.market })
    }
    console.warn(`  [OTHER] ${row.ticker} raw=${row.market} (skipped)`)
    return null
  }
  if (normalized === row.market) {
    stats.unchanged++
    return null
  }
  stats.changed++
  return normalized
}

function reportStats(tableName: string, stats: TableStats): void {
  console.log(
    `[${tableName}] scanned=${stats.scanned} changed=${stats.changed} unchanged=${stats.unchanged} OTHER=${stats.other}`
  )
  if (stats.other > 0) {
    console.log(
      `  OTHER 샘플: ${stats.otherSamples.map((s) => `${s.key}(${s.raw})`).join(', ')}`
    )
  }
}

async function processChunked<T extends Row>(
  tableName: string,
  rows: T[],
  applyUpdate: (tx: TxClient, pk: string, market: string) => Promise<void>,
  dryRun: boolean
): Promise<TableStats> {
  const stats = emptyStats()
  const updates: { pk: string; market: string }[] = []

  for (const row of rows) {
    const normalized = classifyRow(row, stats)
    if (normalized !== null) {
      updates.push({ pk: row.pk, market: normalized })
    }
  }

  if (dryRun || updates.length === 0) {
    reportStats(tableName, stats)
    return stats
  }

  // 배치 단위로 트랜잭션 분리 — 단일 거대 트랜잭션의 락/timeout 회피
  // applyUpdate는 반드시 tx 클라이언트로 실행 (배치 내 원자성 보장)
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE)
    await prisma.$transaction(
      async (tx) => {
        for (const u of batch) {
          await applyUpdate(tx, u.pk, u.market)
        }
      },
      { timeout: TX_TIMEOUT_MS }
    )
    console.log(`  [${tableName}] ${Math.min(i + BATCH_SIZE, updates.length)}/${updates.length} 업데이트 완료`)
  }

  reportStats(tableName, stats)
  return stats
}

async function migratePriceCache(dryRun: boolean): Promise<TableStats> {
  const rows = await prisma.priceCache.findMany({ select: { ticker: true, market: true } })
  return processChunked(
    'PriceCache',
    rows.map((r) => ({ pk: r.ticker, ticker: r.ticker, market: r.market })),
    async (tx, ticker, market) => {
      await tx.priceCache.update({ where: { ticker }, data: { market } })
    },
    dryRun
  )
}

async function migrateWatchlist(dryRun: boolean): Promise<TableStats> {
  const rows = await prisma.watchlist.findMany({ select: { id: true, ticker: true, market: true } })
  return processChunked(
    'Watchlist',
    rows.map((r) => ({ pk: r.id, ticker: r.ticker, market: r.market })),
    async (tx, id, market) => {
      await tx.watchlist.update({ where: { id }, data: { market } })
    },
    dryRun
  )
}

async function migrateHolding(dryRun: boolean): Promise<TableStats> {
  const rows = await prisma.holding.findMany({ select: { id: true, ticker: true, market: true } })
  return processChunked(
    'Holding',
    rows.map((r) => ({ pk: r.id, ticker: r.ticker, market: r.market })),
    async (tx, id, market) => {
      await tx.holding.update({ where: { id }, data: { market } })
    },
    dryRun
  )
}

async function migrateTrade(dryRun: boolean): Promise<TableStats> {
  const rows = await prisma.trade.findMany({ select: { id: true, ticker: true, market: true } })
  return processChunked(
    'Trade',
    rows.map((r) => ({ pk: r.id, ticker: r.ticker, market: r.market })),
    async (tx, id, market) => {
      await tx.trade.update({ where: { id }, data: { market } })
    },
    dryRun
  )
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')
  console.log(`[migrate] market 코드 정규화 시작 (dry-run=${dryRun}, batchSize=${BATCH_SIZE})`)

  await migratePriceCache(dryRun)
  await migrateWatchlist(dryRun)
  await migrateHolding(dryRun)
  await migrateTrade(dryRun)

  console.log(`[migrate] 완료${dryRun ? ' (dry-run, DB 미반영)' : ''}`)
}

main()
  .catch((err) => {
    console.error('[migrate] 실패:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
