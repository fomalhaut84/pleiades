import YahooFinance from 'yahoo-finance2'
import { prisma } from '@/lib/prisma'

const yahooFinance = new YahooFinance()

interface BackfillResult {
  ticker: string
  inserted: number
  skipped: number
}

/**
 * 벤치마크 히스토리를 Yahoo Finance에서 조회하여 DB에 저장한다.
 * 기본 1년치 backfill.
 */
export async function backfillBenchmark(
  ticker: string,
  months: number = 12
): Promise<BackfillResult> {
  const startDate = new Date()
  startDate.setMonth(startDate.getMonth() - months)
  startDate.setUTCHours(0, 0, 0, 0)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const history: any[] = await yahooFinance.historical(ticker, {
    period1: startDate,
    period2: new Date(),
    interval: '1d',
  })

  let inserted = 0
  let skipped = 0

  for (const row of history) {
    const close = Number(row.close)
    if (!close || isNaN(close)) {
      skipped++
      continue
    }

    const priceDate = new Date(row.date)
    priceDate.setUTCHours(0, 0, 0, 0)

    try {
      await prisma.benchmarkPrice.upsert({
        where: {
          ticker_priceDate: { ticker, priceDate },
        },
        update: { close },
        create: {
          ticker,
          priceDate,
          close,
          currency: 'USD',
        },
      })
      inserted++
    } catch {
      skipped++
    }
  }

  console.log(`[benchmark] ${ticker}: ${inserted} inserted, ${skipped} skipped`)
  return { ticker, inserted, skipped }
}

/**
 * 모든 계좌의 벤치마크를 backfill한다.
 */
export async function backfillAllBenchmarks(months: number = 12): Promise<BackfillResult[]> {
  const accounts = await prisma.account.findMany({
    where: { benchmarkTicker: { not: null } },
    select: { benchmarkTicker: true },
  })

  const uniqueTickers = Array.from(
    new Set(accounts.map((a) => a.benchmarkTicker!))
  )

  const results: BackfillResult[] = []
  for (const ticker of uniqueTickers) {
    const result = await backfillBenchmark(ticker, months)
    results.push(result)
  }

  return results
}
