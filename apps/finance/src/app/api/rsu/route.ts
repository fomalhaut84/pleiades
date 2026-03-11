import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const schedules = await prisma.rSUSchedule.findMany({
      orderBy: { vestingDate: 'asc' },
      include: { account: { select: { id: true, name: true } } },
    })

    return NextResponse.json({ schedules })
  } catch (error) {
    console.error('GET /api/rsu error:', error)
    return NextResponse.json(
      { error: 'RSU 스케줄을 불러올 수 없습니다.' },
      { status: 500 }
    )
  }
}
