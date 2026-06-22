import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ok } from '@/lib/api-response'

export async function GET() {
  try {
    const accounts = await prisma.account.findMany({
      include: {
        holdings: {
          orderBy: { avgPrice: 'desc' },
        },
        _count: { select: { holdings: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    return ok(accounts)
  } catch (error) {
    console.error('GET /api/accounts error:', error)
    return NextResponse.json(
      { error: '계좌 목록을 불러올 수 없습니다.' },
      { status: 500 }
    )
  }
}
