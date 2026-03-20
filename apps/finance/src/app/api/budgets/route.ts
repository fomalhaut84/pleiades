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
      include: { category: { select: { id: true, name: true, icon: true, type: true } } },
    })

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

    // 전체 예산
    const totalBudgetRecord = budgets.find((b) => b.categoryId === null)
    const totalBudget = totalBudgetRecord
      ? { id: totalBudgetRecord.id, amount: totalBudgetRecord.amount, spent: totalSpent }
      : null

    // 카테고리별 예산
    const categoryBudgets = budgets
      .filter((b) => b.categoryId !== null)
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

    return NextResponse.json({
      year,
      month,
      totalBudget,
      categoryBudgets,
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

    // Serializable 트랜잭션으로 중복 방지 (nullable categoryId 대응)
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.budget.findFirst({
        where: { categoryId, year, month },
      })
      if (existing) {
        const updated = await tx.budget.update({ where: { id: existing.id }, data: { amount } })
        return { budget: updated, created: false }
      }
      const created = await tx.budget.create({ data: { categoryId, year, month, amount } })
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
      const existing = await tx.budget.findFirst({
        where: { categoryId: b.categoryId, year: targetYear, month: targetMonth },
      })
      if (existing) {
        await tx.budget.update({ where: { id: existing.id }, data: { amount: b.amount } })
      } else {
        await tx.budget.create({
          data: { categoryId: b.categoryId, year: targetYear, month: targetMonth, amount: b.amount },
        })
      }
      count++
    }
    return count
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

  return NextResponse.json({ copied, targetYear, targetMonth })
}
