import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const VALID_CATEGORIES = ['savings', 'insurance', 'real_estate', 'pension', 'loan', 'cash', 'other']

/** YYYY-MM-DD 엄격 파싱 (2026-02-30 같은 불가능 날짜 거부) */
function parseStrictDate(str: string): Date | null {
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  const [, y, m, d] = match.map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null // 정규화 발생 = 불가능 날짜
  }
  return date
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const owner = searchParams.get('owner')
    const category = searchParams.get('category')

    const where: Record<string, unknown> = {}
    if (owner) where.owner = owner
    if (category) where.category = category

    const assets = await prisma.asset.findMany({
      where,
      orderBy: [{ isLiability: 'asc' }, { category: 'asc' }, { name: 'asc' }],
    })

    const totalAssets = assets
      .filter((a) => !a.isLiability)
      .reduce((sum, a) => sum + a.value, 0)
    const totalLiabilities = assets
      .filter((a) => a.isLiability)
      .reduce((sum, a) => sum + a.value, 0)

    return NextResponse.json({
      assets,
      totalAssets,
      totalLiabilities,
      netAssets: totalAssets - totalLiabilities,
    })
  } catch (error) {
    console.error('GET /api/assets error:', error)
    return NextResponse.json({ error: '자산 목록을 불러올 수 없습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 })
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 })
    }

    const { name, category, owner, value, isLiability, interestRate, maturityDate, note } =
      body as Record<string, unknown>

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: '자산명을 입력해주세요.' }, { status: 400 })
    }
    if (!category || typeof category !== 'string' || !VALID_CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: `유효한 카테고리를 선택해주세요: ${VALID_CATEGORIES.join(', ')}` },
        { status: 400 }
      )
    }
    if (!owner || typeof owner !== 'string' || (owner as string).trim().length === 0) {
      return NextResponse.json({ error: '소유자를 입력해주세요.' }, { status: 400 })
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return NextResponse.json({ error: '유효한 금액을 입력해주세요.' }, { status: 400 })
    }
    if (isLiability !== undefined && typeof isLiability !== 'boolean') {
      return NextResponse.json({ error: 'isLiability는 boolean이어야 합니다.' }, { status: 400 })
    }

    // optional 필드 검증 (제공된 경우 타입/값 확인)
    let validatedInterestRate: number | null = null
    if (interestRate !== undefined && interestRate !== null) {
      if (typeof interestRate !== 'number' || !Number.isFinite(interestRate)) {
        return NextResponse.json({ error: '이율은 숫자여야 합니다.' }, { status: 400 })
      }
      validatedInterestRate = interestRate
    }

    let validatedMaturityDate: Date | null = null
    if (maturityDate !== undefined && maturityDate !== null) {
      if (typeof maturityDate !== 'string') {
        return NextResponse.json({ error: '만기일은 YYYY-MM-DD 형식이어야 합니다.' }, { status: 400 })
      }
      const d = parseStrictDate(maturityDate)
      if (!d) {
        return NextResponse.json({ error: '유효하지 않은 만기일입니다.' }, { status: 400 })
      }
      validatedMaturityDate = d
    }

    const asset = await prisma.asset.create({
      data: {
        name: name.trim(),
        category,
        owner: (owner as string).trim(),
        value: Math.round(value),
        isLiability: isLiability === true,
        interestRate: interestRate !== undefined && interestRate !== null ? validatedInterestRate : null,
        maturityDate: maturityDate !== undefined && maturityDate !== null ? validatedMaturityDate : null,
        note: typeof note === 'string' ? note.trim() || null : null,
      },
    })

    return NextResponse.json(asset, { status: 201 })
  } catch (error) {
    console.error('POST /api/assets error:', error)
    return NextResponse.json({ error: '자산 등록에 실패했습니다.' }, { status: 500 })
  }
}
