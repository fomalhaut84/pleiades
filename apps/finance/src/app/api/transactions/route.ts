import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateTransactionInput } from '@/lib/transaction-utils'
import { sendToWhooing } from '@/lib/whooing-webhook'

export const dynamic = 'force-dynamic'

/**
 * GET /api/transactions
 *
 * Query params:
 *   type     — "expense" | "income" (카테고리 type 기준 필터)
 *   year     — 연도 (기본: 올해)
 *   month    — 월 (선택)
 *   offset   — 페이지네이션 (기본 0)
 *   limit    — 페이지 크기 (기본 20, 최대 100)
 *   listOnly — "true"이면 transactions/total만 반환 (페이지 이동 최적화)
 *
 * 응답:
 *   transactions — 거래 내역 (최신순)
 *   summary — { totalExpense, totalIncome, count }
 *   byMonth — [{ month, expense, income }] (12개월)
 *   byCategory — [{ categoryId, categoryName, icon, total, count }]
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const rawType = sp.get('type')
    if (rawType && rawType !== 'expense' && rawType !== 'income') {
      return NextResponse.json({ error: 'type은 expense 또는 income만 허용됩니다.' }, { status: 400 })
    }
    const type = rawType ?? undefined
    const yearStr = sp.get('year')
    const monthStr = sp.get('month')
    const offsetStr = sp.get('offset')
    const limitStr = sp.get('limit')
    const listOnly = sp.get('listOnly') === 'true'

    const currentYear = new Date().getFullYear()
    const year = yearStr && /^\d{4}$/.test(yearStr) ? parseInt(yearStr) : currentYear
    const rawMonth = monthStr && /^\d{1,2}$/.test(monthStr) ? parseInt(monthStr) : undefined
    const month = rawMonth && rawMonth >= 1 && rawMonth <= 12 ? rawMonth : undefined

    const rawOffset = parseInt(offsetStr ?? '0')
    const offset = isNaN(rawOffset) || rawOffset < 0 ? 0 : rawOffset
    const rawLimit = parseInt(limitStr ?? '20')
    const limit = isNaN(rawLimit) || rawLimit < 1 ? 20 : Math.min(rawLimit, 100)

    // 기간 범위 계산
    let dateFrom: Date
    let dateTo: Date

    if (month) {
      dateFrom = new Date(Date.UTC(year, month - 1, 1))
      dateTo = new Date(Date.UTC(year, month, 1))
    } else {
      dateFrom = new Date(Date.UTC(year, 0, 1))
      dateTo = new Date(Date.UTC(year + 1, 0, 1))
    }

    // 카테고리 타입별 ID 조회
    let categoryIds: string[] | undefined
    if (type) {
      const cats = await prisma.category.findMany({
        where: { type },
        select: { id: true },
      })
      categoryIds = cats.map((c) => c.id)
    }

    const baseWhere = {
      transactedAt: { gte: dateFrom, lt: dateTo },
      ...(categoryIds ? { categoryId: { in: categoryIds } } : {}),
    }

    // 목록 + 카운트 (항상 조회)
    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where: baseWhere,
        orderBy: [{ transactedAt: 'desc' }, { createdAt: 'desc' }],
        skip: offset,
        take: limit,
        include: {
          category: { select: { name: true, icon: true, type: true } },
        },
      }),
      prisma.transaction.count({ where: baseWhere }),
    ])

    const serialized = transactions.map((tx) => ({
      id: tx.id,
      amount: tx.amount,
      description: tx.description,
      categoryId: tx.categoryId,
      categoryName: tx.category.name,
      categoryIcon: tx.category.icon,
      categoryType: tx.category.type,
      transactedAt: tx.transactedAt.toISOString(),
      currency: 'KRW',
    }))

    // listOnly 모드: 페이지 이동 시 집계 스킵
    if (listOnly) {
      return NextResponse.json({
        transactions: serialized,
        total,
        offset,
        limit,
        year,
      })
    }

    // 집계 조회 (필터 변경 시에만)
    const yearFrom = new Date(Date.UTC(year, 0, 1))
    const yearTo = new Date(Date.UTC(year + 1, 0, 1))

    const allCategories = await prisma.category.findMany({
      select: { id: true, name: true, icon: true, type: true },
    })
    const categoryMap = new Map(allCategories.map((c) => [c.id, c]))

    const [annualTransactions, filteredAgg] = await Promise.all([
      prisma.transaction.findMany({
        where: { transactedAt: { gte: yearFrom, lt: yearTo } },
        select: { amount: true, transactedAt: true, categoryId: true },
      }),
      prisma.transaction.groupBy({
        by: ['categoryId'],
        where: baseWhere,
        _sum: { amount: true },
        _count: true,
      }),
    ])

    // byMonth (항상 연간)
    const byMonth = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      expense: 0,
      income: 0,
    }))

    for (const tx of annualTransactions) {
      const m = tx.transactedAt.getUTCMonth()
      const cat = categoryMap.get(tx.categoryId)
      if (!cat) continue
      if (cat.type === 'expense') {
        byMonth[m].expense += tx.amount
      } else {
        byMonth[m].income += tx.amount
      }
    }

    // summary + byCategory
    let totalExpense = 0
    let totalIncome = 0
    let filteredCount = 0

    const byCategory = filteredAgg
      .map((row) => {
        const cat = categoryMap.get(row.categoryId)
        if (!cat) return null
        const rowTotal = row._sum.amount ?? 0
        const count = row._count

        if (cat.type === 'expense') totalExpense += rowTotal
        else totalIncome += rowTotal
        filteredCount += count

        return {
          categoryId: row.categoryId,
          categoryName: cat.name,
          icon: cat.icon,
          type: cat.type,
          total: rowTotal,
          count,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.total - a.total)

    return NextResponse.json({
      transactions: serialized,
      total,
      offset,
      limit,
      summary: {
        totalExpense,
        totalIncome,
        net: totalIncome - totalExpense,
        count: filteredCount,
        currency: 'KRW',
      },
      byMonth,
      byCategory,
      year,
    })
  } catch (error) {
    console.error('[api/transactions] GET 실패:', error)
    return NextResponse.json({ error: '거래 내역 조회에 실패했습니다.' }, { status: 500 })
  }
}

/**
 * POST /api/transactions
 *
 * Body: { amount: number, description: string, categoryId: string, transactedAt?: string }
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
    const errors = validateTransactionInput(body)
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0].message, errors }, { status: 400 })
    }

    const amount = body.amount as number
    const description = (body.description as string).trim()
    const categoryId = body.categoryId as string
    const transactedAt = body.transactedAt
      ? new Date(body.transactedAt as string)
      : new Date()

    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true, name: true, icon: true, type: true },
    })
    if (!category) {
      return NextResponse.json({ error: '존재하지 않는 카테고리입니다.' }, { status: 400 })
    }

    const transaction = await prisma.transaction.create({
      data: {
        amount,
        description,
        categoryId,
        transactedAt,
      },
      include: {
        category: { select: { name: true, icon: true, type: true } },
      },
    })

    // 후잉 웹훅 전송 (비차단)
    sendToWhooing({
      amount: transaction.amount,
      description: transaction.description,
      categoryId: transaction.categoryId,
      transactedAt: transaction.transactedAt,
    }).catch((err) => console.error('[whooing] 전송 실패:', err))

    return NextResponse.json({
      id: transaction.id,
      amount: transaction.amount,
      description: transaction.description,
      categoryId: transaction.categoryId,
      categoryName: transaction.category.name,
      categoryIcon: transaction.category.icon,
      categoryType: transaction.category.type,
      transactedAt: transaction.transactedAt.toISOString(),
      currency: 'KRW',
    }, { status: 201 })
  } catch (error) {
    console.error('[api/transactions] POST 실패:', error)
    return NextResponse.json({ error: '내역 생성에 실패했습니다.' }, { status: 500 })
  }
}
