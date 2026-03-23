import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { validateBudgetInput } from '@/lib/budget-utils'

export const dynamic = 'force-dynamic'

/**
 * GET /api/budgets?year=2026&month=3
 *
 * 해당 월의 전체 예산 + 카테고리별 예산 + 소비 합산
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

    // 예산 조회
    const budgets = await prisma.budget.findMany({
      where: { year, month },
      include: {
        category: { select: { id: true, name: true, icon: true, type: true } },
        group: { select: { id: true, name: true, icon: true } },
      },
    })

    // 카테고리 → 그룹 매핑 조회
    const allExpenseCategories = await prisma.category.findMany({
      where: { type: 'expense' },
      select: { id: true, name: true, icon: true, groupId: true },
    })
    const catGroupMap = new Map(allExpenseCategories.map((c) => [c.id, c.groupId]))

    // 해당 월 소비 카테고리별 합산
    const dateFrom = new Date(Date.UTC(year, month - 1, 1))
    const dateTo = new Date(Date.UTC(year, month, 1))

    const expenseCategories = await prisma.category.findMany({
      where: { type: 'expense' },
      select: { id: true },
    })
    const expenseCatIds = expenseCategories.map((c) => c.id)

    const [spentByCategory, totalSpentAgg] = await Promise.all([
      prisma.transaction.groupBy({
        by: ['categoryId'],
        where: {
          transactedAt: { gte: dateFrom, lt: dateTo },
          categoryId: { in: expenseCatIds },
        },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: {
          transactedAt: { gte: dateFrom, lt: dateTo },
          categoryId: { in: expenseCatIds },
        },
        _sum: { amount: true },
      }),
    ])

    const spentMap = new Map(spentByCategory.map((s) => [s.categoryId, s._sum.amount ?? 0]))
    const totalSpent = totalSpentAgg._sum.amount ?? 0

    // 전체 예산 (categoryId=null AND groupId=null)
    const totalBudgetRecord = budgets.find((b) => b.categoryId === null && b.groupId === null)
    const totalBudget = totalBudgetRecord
      ? { id: totalBudgetRecord.id, amount: totalBudgetRecord.amount, spent: totalSpent }
      : null

    // 카테고리별 예산 (groupId가 null인 것만)
    const categoryBudgets = budgets
      .filter((b) => b.categoryId !== null && b.groupId === null)
      .map((b) => {
        const spent = spentMap.get(b.categoryId!) ?? 0
        return {
          id: b.id,
          categoryId: b.categoryId!,
          categoryName: b.category?.name ?? '',
          categoryIcon: b.category?.icon ?? null,
          amount: b.amount,
          spent,
          remaining: b.amount - spent,
          pct: b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0,
        }
      })
      .sort((a, b) => b.pct - a.pct)

    // 그룹별 예산
    const groupBudgets = budgets
      .filter((b) => b.groupId !== null && b.categoryId === null)
      .map((b) => {
        // 그룹 내 카테고리들의 소비 합산
        const groupCatIds = allExpenseCategories
          .filter((c) => c.groupId === b.groupId)
          .map((c) => c.id)
        const groupSpent = groupCatIds.reduce((sum, catId) => sum + (spentMap.get(catId) ?? 0), 0)
        // 그룹 내 카테고리별 소비 분배
        const categoryBreakdown = groupCatIds
          .map((catId) => {
            const cat = allExpenseCategories.find((c) => c.id === catId)
            const spent = spentMap.get(catId) ?? 0
            return { categoryId: catId, categoryName: cat?.name ?? '', categoryIcon: cat?.icon ?? null, spent }
          })
          .filter((c) => c.spent > 0)
          .sort((a, b) => b.spent - a.spent)

        return {
          id: b.id,
          groupId: b.groupId!,
          groupName: b.group?.name ?? '',
          groupIcon: b.group?.icon ?? null,
          amount: b.amount,
          spent: groupSpent,
          remaining: b.amount - groupSpent,
          pct: b.amount > 0 ? Math.round((groupSpent / b.amount) * 100) : 0,
          categoryBreakdown,
        }
      })
      .sort((a, b) => b.pct - a.pct)

    // 그룹별 소비 합산 (파이차트용)
    const spentByGroup: Record<string, { groupId: string; groupName: string; groupIcon: string | null; total: number }> = {}
    // 그룹 정보 맵 구성
    const groupInfoMap = new Map<string, { name: string; icon: string | null }>()
    for (const b of budgets) {
      if (b.groupId && b.group) {
        groupInfoMap.set(b.groupId, { name: b.group.name, icon: b.group.icon })
      }
    }
    // 카테고리별 그룹 조회도 추가
    const allGroups = await prisma.categoryGroup.findMany({ select: { id: true, name: true, icon: true } })
    for (const g of allGroups) {
      groupInfoMap.set(g.id, { name: g.name, icon: g.icon })
    }

    spentByCategory.forEach((s) => {
      const gId = catGroupMap.get(s.categoryId)
      if (!gId) return
      const amt = s._sum.amount ?? 0
      if (!spentByGroup[gId]) {
        const info = groupInfoMap.get(gId)
        spentByGroup[gId] = { groupId: gId, groupName: info?.name ?? '', groupIcon: info?.icon ?? null, total: 0 }
      }
      spentByGroup[gId].total += amt
    })

    return NextResponse.json({
      year,
      month,
      totalBudget,
      categoryBudgets,
      groupBudgets,
      spentByGroup: Object.values(spentByGroup).sort((a, b) => b.total - a.total),
    })
  } catch (error) {
    console.error('[api/budgets] GET 실패:', error)
    return NextResponse.json({ error: '예산 조회에 실패했습니다.' }, { status: 500 })
  }
}

/**
 * POST /api/budgets
 *
 * Body: { amount, year, month, categoryId? }  — upsert
 * Body: { action: "copy", sourceYear, sourceMonth, targetYear, targetMonth }  — 복사
 */
export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: '유효한 JSON 형식이 아닙니다.' }, { status: 400 })
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: '유효한 JSON 객체가 아닙니다.' }, { status: 400 })
    }

    // 복사 액션
    if (body.action === 'copy') {
      return handleCopy(body)
    }

    // 일반 upsert
    const errors = validateBudgetInput(body)
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0].message, errors }, { status: 400 })
    }

    const amount = body.amount as number
    const year = body.year as number
    const month = body.month as number
    const categoryId = (body.categoryId as string | null) ?? null
    const groupId = (body.groupId as string | null) ?? null

    // categoryId와 groupId 동시 설정 불가
    if (categoryId && groupId) {
      return NextResponse.json({ error: '카테고리와 그룹을 동시에 지정할 수 없습니다.' }, { status: 400 })
    }

    // 그룹 존재 확인
    if (groupId) {
      const grp = await prisma.categoryGroup.findUnique({ where: { id: groupId }, select: { id: true } })
      if (!grp) {
        return NextResponse.json({ error: '존재하지 않는 그룹입니다.' }, { status: 400 })
      }
    }

    // 카테고리 존재 + expense 타입 확인 (null이 아닌 경우)
    if (categoryId) {
      const cat = await prisma.category.findUnique({
        where: { id: categoryId },
        select: { id: true, type: true },
      })
      if (!cat) {
        return NextResponse.json({ error: '존재하지 않는 카테고리입니다.' }, { status: 400 })
      }
      if (cat.type !== 'expense') {
        return NextResponse.json({ error: '예산은 소비 카테고리에만 설정할 수 있습니다.' }, { status: 400 })
      }
    }

    // Serializable 트랜잭션으로 중복 방지
    const findWhere = groupId
      ? { groupId, year, month, categoryId: null }
      : { categoryId, year, month, groupId: null }
    const createData = groupId
      ? { groupId, year, month, amount }
      : { categoryId, year, month, amount }

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.budget.findFirst({ where: findWhere })
      if (existing) {
        const updated = await tx.budget.update({ where: { id: existing.id }, data: { amount } })
        return { budget: updated, created: false }
      }
      const created = await tx.budget.create({ data: createData })
      return { budget: created, created: true }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    return NextResponse.json(result.budget, { status: result.created ? 201 : 200 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return NextResponse.json({ error: '존재하지 않는 카테고리입니다.' }, { status: 400 })
    }
    console.error('[api/budgets] POST 실패:', error)
    return NextResponse.json({ error: '예산 저장에 실패했습니다.' }, { status: 500 })
  }
}

async function handleCopy(body: Record<string, unknown>) {
  const sourceYear = typeof body.sourceYear === 'number' ? body.sourceYear : NaN
  const sourceMonth = typeof body.sourceMonth === 'number' ? body.sourceMonth : NaN
  const targetYear = typeof body.targetYear === 'number' ? body.targetYear : NaN
  const targetMonth = typeof body.targetMonth === 'number' ? body.targetMonth : NaN

  if (
    !Number.isInteger(sourceYear) || !Number.isInteger(sourceMonth) ||
    !Number.isInteger(targetYear) || !Number.isInteger(targetMonth) ||
    sourceMonth < 1 || sourceMonth > 12 || targetMonth < 1 || targetMonth > 12
  ) {
    return NextResponse.json({ error: '유효한 sourceYear, sourceMonth, targetYear, targetMonth를 입력해주세요.' }, { status: 400 })
  }

  const sourceBudgets = await prisma.budget.findMany({
    where: { year: sourceYear, month: sourceMonth },
  })

  if (sourceBudgets.length === 0) {
    return NextResponse.json({ error: '복사할 예산이 없습니다.' }, { status: 400 })
  }

  const copied = await prisma.$transaction(async (tx) => {
    let count = 0
    for (const b of sourceBudgets) {
      // categoryId와 groupId 모두 보존하여 복사
      const findWhere = b.groupId
        ? { groupId: b.groupId, year: targetYear, month: targetMonth, categoryId: null as string | null }
        : { categoryId: b.categoryId, year: targetYear, month: targetMonth, groupId: null as string | null }
      const existing = await tx.budget.findFirst({ where: findWhere })
      if (existing) {
        await tx.budget.update({ where: { id: existing.id }, data: { amount: b.amount } })
      } else {
        await tx.budget.create({
          data: {
            categoryId: b.categoryId,
            groupId: b.groupId,
            year: targetYear,
            month: targetMonth,
            amount: b.amount,
          },
        })
      }
      count++
    }
    return count
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

  return NextResponse.json({ copied, targetYear, targetMonth })
}
