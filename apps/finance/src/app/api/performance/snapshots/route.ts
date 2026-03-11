import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { takeAllSnapshots } from '@/lib/performance/snapshot'
import { BENCHMARK_DISPLAY_NAMES } from '@/lib/performance/constants'

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
      return NextResponse.json({ error: 'accountId는 필수입니다.' }, { status: 400 })
    }

    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const where: Record<string, unknown> = { accountId }
    if (from || to) {
      const dateFilter: Record<string, Date> = {}
      if (from) {
        const d = new Date(from)
        if (isNaN(d.getTime())) {
          return NextResponse.json({ error: '유효한 시작일을 입력해주세요.' }, { status: 400 })
        }
        dateFilter.gte = d
      }
      if (to) {
        const d = new Date(to)
        if (isNaN(d.getTime())) {
          return NextResponse.json({ error: '유효한 종료일을 입력해주세요.' }, { status: 400 })
        }
        dateFilter.lte = d
      }
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

    return NextResponse.json({
      snapshots: normalizedSnapshots,
      benchmark,
      benchmarkName,
    })
  } catch (error) {
    console.error('GET /api/performance/snapshots error:', error)
    return NextResponse.json({ error: '스냅샷 데이터를 불러올 수 없습니다.' }, { status: 500 })
  }
}

/**
 * POST /api/performance/snapshots
 * 수동 스냅샷 트리거
 */
export async function POST() {
  try {
    const results = await takeAllSnapshots()
    return NextResponse.json({ results }, { status: 201 })
  } catch (error) {
    console.error('POST /api/performance/snapshots error:', error)
    return NextResponse.json({ error: '스냅샷 생성에 실패했습니다.' }, { status: 500 })
  }
}
