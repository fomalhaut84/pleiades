import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

interface GroupSpent {
  groupId: string
  groupName: string
  groupIcon: string | null
  total: number
}

/**
 * GET /api/transactions/analysis?year=2026&month=3
 *
 * 응답:
 *   monthCompare — 전월 대비 그룹별 변동
 *   trend — 최근 6개월 그룹별 지출 트렌드
 *   prevMonthSummary — 전월 소비/수입/건수 (요약 카드용)
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const yearStr = sp.get('year')
    const monthStr = sp.get('month')

    if (!yearStr || !monthStr) {
      return NextResponse.json({ error: 'year, month 파라미터가 필요합니다.' }, { status: 400 })
    }

    const year = parseInt(yearStr)
    const month = parseInt(monthStr)
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: '유효한 year, month를 입력해주세요.' }, { status: 400 })
    }

    // 카테고리 → 그룹 매핑
    const categories = await prisma.category.findMany({
      where: { type: 'expense' },
      select: { id: true, groupId: true },
    })
    const catGroupMap = new Map(categories.map((c) => [c.id, c.groupId]))

    // 그룹 정보
    const groups = await prisma.categoryGroup.findMany({
      select: { id: true, name: true, icon: true },
    })
    const groupInfoMap = new Map(groups.map((g) => [g.id, { name: g.name, icon: g.icon }]))

    // 이번 달 + 전월 기간
    const thisFrom = new Date(Date.UTC(year, month - 1, 1))
    const thisTo = new Date(Date.UTC(year, month, 1))
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    const prevFrom = new Date(Date.UTC(prevYear, prevMonth - 1, 1))
    const prevTo = new Date(Date.UTC(prevYear, prevMonth, 1))

    const expenseCatIds = categories.map((c) => c.id)

    // 이번 달 + 전월 카테고리별 소비
    const [thisSpent, prevSpent, prevIncome, prevCount] = await Promise.all([
      prisma.transaction.groupBy({
        by: ['categoryId'],
        where: { transactedAt: { gte: thisFrom, lt: thisTo }, categoryId: { in: expenseCatIds } },
        _sum: { amount: true },
      }),
      prisma.transaction.groupBy({
        by: ['categoryId'],
        where: { transactedAt: { gte: prevFrom, lt: prevTo }, categoryId: { in: expenseCatIds } },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: {
          transactedAt: { gte: prevFrom, lt: prevTo },
          category: { type: 'income' },
        },
        _sum: { amount: true },
      }),
      prisma.transaction.count({
        where: { transactedAt: { gte: prevFrom, lt: prevTo } },
      }),
    ])

    // 그룹별 합산
    const thisGroupSpent = aggregateByGroup(thisSpent, catGroupMap, groupInfoMap)
    const prevGroupSpent = aggregateByGroup(prevSpent, catGroupMap, groupInfoMap)

    // 전월 대비 계산
    const allGroupIds = new Set([...Array.from(thisGroupSpent.keys()), ...Array.from(prevGroupSpent.keys())])
    const monthCompare = Array.from(allGroupIds).map((gId) => {
      const current = thisGroupSpent.get(gId)?.total ?? 0
      const previous = prevGroupSpent.get(gId)?.total ?? 0
      const change = current - previous
      const changePct = previous > 0 ? Math.round((change / previous) * 1000) / 10 : (current > 0 ? 100 : 0)
      const info = groupInfoMap.get(gId)
      return {
        groupId: gId,
        groupName: info?.name ?? '미분류',
        groupIcon: info?.icon ?? null,
        current,
        previous,
        change,
        changePct,
      }
    }).sort((a, b) => Math.abs(b.change) - Math.abs(a.change))

    // 전월 소비 합계 (그룹 무관, 전체 expense 카테고리 기준)
    const prevExpenseTotal = prevSpent.reduce((sum, s) => sum + (s._sum.amount ?? 0), 0)

    // === 트렌드 (최근 6개월) ===
    const trendMonths: { year: number; month: number }[] = []
    for (let i = 5; i >= 0; i--) {
      let tm = month - i
      let ty = year
      if (tm <= 0) { tm += 12; ty -= 1 }
      trendMonths.push({ year: ty, month: tm })
    }

    const trendFrom = new Date(Date.UTC(trendMonths[0].year, trendMonths[0].month - 1, 1))
    const trendTo = new Date(Date.UTC(year, month, 1))

    const trendData = await prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        transactedAt: { gte: trendFrom, lt: trendTo },
        categoryId: { in: expenseCatIds },
      },
      _sum: { amount: true },
    })

    // 월별로 분리하기 위해 raw 데이터 필요
    const trendRaw = await prisma.transaction.findMany({
      where: {
        transactedAt: { gte: trendFrom, lt: trendTo },
        categoryId: { in: expenseCatIds },
      },
      select: { amount: true, categoryId: true, transactedAt: true },
    })

    // 월별 그룹별 합산
    const trendByMonthGroup: Record<string, Record<string, number>> = {}
    for (const m of trendMonths) {
      trendByMonthGroup[`${m.year}-${m.month}`] = {}
    }

    for (const tx of trendRaw) {
      const m = tx.transactedAt.getUTCMonth() + 1
      const y = tx.transactedAt.getUTCFullYear()
      const key = `${y}-${m}`
      if (!trendByMonthGroup[key]) continue
      const gId = catGroupMap.get(tx.categoryId)
      if (!gId) continue
      trendByMonthGroup[key][gId] = (trendByMonthGroup[key][gId] ?? 0) + tx.amount
    }

    // 그룹별 트렌드 배열 구성 + 평균 + 이상치
    const topGroupIds = getTopGroups(trendData, catGroupMap, 5)
    const trend = topGroupIds.map((gId) => {
      const info = groupInfoMap.get(gId)
      const values = trendMonths.map((m) => trendByMonthGroup[`${m.year}-${m.month}`][gId] ?? 0)
      const nonZero = values.filter((v) => v > 0)
      const avg = nonZero.length > 0 ? Math.round(nonZero.reduce((a, b) => a + b, 0) / nonZero.length) : 0
      const anomalies = values.map((v) => avg > 0 && v > avg * 1.5)
      return {
        groupId: gId,
        groupName: info?.name ?? '미분류',
        groupIcon: info?.icon ?? null,
        values,
        avg,
        anomalies,
      }
    })

    return NextResponse.json({
      monthCompare,
      prevMonthSummary: {
        totalExpense: prevExpenseTotal,
        totalIncome: prevIncome._sum.amount ?? 0,
        count: prevCount,
      },
      trend: {
        months: trendMonths,
        groups: trend,
      },
    })
  } catch (error) {
    console.error('[api/transactions/analysis] GET 실패:', error)
    return NextResponse.json({ error: '분석 데이터 조회에 실패했습니다.' }, { status: 500 })
  }
}

function aggregateByGroup(
  spent: { categoryId: string; _sum: { amount: number | null } }[],
  catGroupMap: Map<string, string | null>,
  groupInfoMap: Map<string, { name: string; icon: string | null }>,
): Map<string, GroupSpent> {
  const result = new Map<string, GroupSpent>()
  for (const s of spent) {
    const gId = catGroupMap.get(s.categoryId)
    if (!gId) continue
    const existing = result.get(gId)
    const amount = s._sum.amount ?? 0
    if (existing) {
      existing.total += amount
    } else {
      const info = groupInfoMap.get(gId)
      result.set(gId, {
        groupId: gId,
        groupName: info?.name ?? '미분류',
        groupIcon: info?.icon ?? null,
        total: amount,
      })
    }
  }
  return result
}

function getTopGroups(
  spent: { categoryId: string; _sum: { amount: number | null } }[],
  catGroupMap: Map<string, string | null>,
  limit: number,
): string[] {
  const totals = new Map<string, number>()
  for (const s of spent) {
    const gId = catGroupMap.get(s.categoryId)
    if (!gId) continue
    totals.set(gId, (totals.get(gId) ?? 0) + (s._sum.amount ?? 0))
  }
  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([gId]) => gId)
}
