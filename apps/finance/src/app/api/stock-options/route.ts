import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/stock-options — 스톡옵션 목록 조회
 * Query: accountId (optional)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('accountId')

    const where = accountId ? { accountId } : {}

    const stockOptions = await prisma.stockOption.findMany({
      where,
      include: {
        vestings: {
          orderBy: { vestingDate: 'asc' },
        },
        account: {
          select: { name: true },
        },
      },
      orderBy: { grantDate: 'asc' },
    })

    return NextResponse.json({ stockOptions })
  } catch (err) {
    console.error('GET /api/stock-options error:', err)
    return NextResponse.json({ error: '스톡옵션 조회 실패' }, { status: 500 })
  }
}
