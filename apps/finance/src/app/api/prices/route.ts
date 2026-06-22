import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getLastUpdatedAt } from '@/lib/format'
import { ok } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const prices = await prisma.priceCache.findMany({
      orderBy: { ticker: 'asc' },
    })

    const lastUpdatedAt = getLastUpdatedAt(prices)

    return ok({ prices, lastUpdatedAt })
  } catch (error) {
    console.error('GET /api/prices error:', error)
    return NextResponse.json(
      { error: '주가 정보를 불러오지 못했습니다.' },
      { status: 500 }
    )
  }
}
