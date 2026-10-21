import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { takeAllSnapshots } from '@/lib/performance/snapshot'
import { BENCHMARK_DISPLAY_NAMES } from '@/lib/performance/constants'
import { dateRangeSchema } from '@/lib/zod-schemas'
import { zodErrorsToValidation } from '@/lib/zod-utils'
import { ok, fail } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

/**
 * GET /api/performance/snapshots?accountId=xxx&from=...&to=...
 * 차트용 일별 스냅샷 데이터 + 벤치마크 정규화 값
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const accountId = searchParams.get('accountId')

    if (!accountId) {
      return fail('accountId는 필수입니다.', 400)
    }

    const dateResult = dateRangeSchema.safeParse({
      from: searchParams.get('from'),
      to: searchParams.get('to'),
    })
    if (!dateResult.success) {
      const errs = zodErrorsToValidation(dateResult.error)
      return fail(errs[0].message, 400)
    }
    const { from, to } = dateResult.data

    const where: Record<string, unknown> = { accountId }
    if (from || to) {
      const dateFilter: Record<string, Date> = {}
      if (from) dateFilter.gte = new Date(from)
      if (to) dateFilter.lte = new Date(to)
      where.snapshotDate = dateFilter
    }

    const snapshots = await prisma.portfolioSnapshot.findMany({
      where,
      orderBy: { snapshotDate: 'asc' },
      select: {
        snapshotDate: true,
        totalValueKRW: true,
        totalCostKRW: true,
        fxRate: true,
      },
    })

    // 벤치마크 정규화 데이터
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { benchmarkTicker: true },
    })

    let benchmark: { date: string; normalizedValue: number }[] = []
    let benchmarkName: string | null = null

    if (account?.benchmarkTicker && snapshots.length > 0) {
      const benchmarkPrices = await prisma.benchmarkPrice.findMany({
        where: {
          ticker: account.benchmarkTicker,
          priceDate: {
            gte: snapshots[0].snapshotDate,
            lte: snapshots[snapshots.length - 1].snapshotDate,
          },
        },
        orderBy: { priceDate: 'asc' },
        select: { priceDate: true, close: true },
      })

      if (benchmarkPrices.length > 0) {
        const basePrice = benchmarkPrices[0].close
        benchmark = benchmarkPrices.map((p) => ({
          date: p.priceDate.toISOString().slice(0, 10),
          normalizedValue: basePrice > 0 ? (p.close / basePrice) * 100 : 100,
        }))
        benchmarkName = BENCHMARK_DISPLAY_NAMES[account.benchmarkTicker] ?? account.benchmarkTicker
      }
    }

    // 포트폴리오 정규화 (base=100)
    const baseValue = snapshots.length > 0 ? snapshots[0].totalValueKRW : 1
    const normalizedSnapshots = snapshots.map((s) => ({
      date: s.snapshotDate.toISOString().slice(0, 10),
      totalValueKRW: s.totalValueKRW,
      totalCostKRW: s.totalCostKRW,
      fxRate: s.fxRate,
      normalizedValue: baseValue > 0 ? (s.totalValueKRW / baseValue) * 100 : 100,
    }))

    return ok({
      snapshots: normalizedSnapshots,
      benchmark,
      benchmarkName,
    })
  } catch (error) {
    console.error('GET /api/performance/snapshots error:', error)
    return fail('스냅샷 데이터를 불러올 수 없습니다.', 500)
  }
}

/**
 * POST /api/performance/snapshots
 * 수동 스냅샷 트리거
 */
export async function POST() {
  try {
    const results = await takeAllSnapshots()
    return ok(results, { status: 201 })
  } catch (error) {
    console.error('POST /api/performance/snapshots error:', error)
    return fail('스냅샷 생성에 실패했습니다.', 500)
  }
}
