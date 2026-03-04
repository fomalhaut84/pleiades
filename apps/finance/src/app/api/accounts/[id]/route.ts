import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const account = await prisma.account.findUnique({
      where: { id: params.id },
      include: {
        holdings: {
          orderBy: { avgPrice: 'desc' },
        },
        deposits: {
          orderBy: { depositedAt: 'desc' },
        },
      },
    })

    if (!account) {
      return NextResponse.json(
        { error: '계좌를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    return NextResponse.json(account)
  } catch (error) {
    console.error('GET /api/accounts/[id] error:', error)
    return NextResponse.json(
      { error: '계좌 정보를 불러올 수 없습니다.' },
      { status: 500 }
    )
  }
}
