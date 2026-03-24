import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

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

/**
 * PATCH /api/accounts/[id]
 *
 * Body: { name?, strategy?, horizon?, benchmarkTicker?, ownerAge? }
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: '유효한 JSON 형식이 아닙니다.' }, { status: 400 })
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: '유효한 JSON 객체가 아닙니다.' }, { status: 400 })
    }

    const data: Record<string, unknown> = {}

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        return NextResponse.json({ error: '계좌 이름을 입력해주세요.' }, { status: 400 })
      }
      data.name = body.name.trim()
    }

    if (body.strategy !== undefined) {
      if (body.strategy !== null && typeof body.strategy !== 'string') {
        return NextResponse.json({ error: '전략은 문자열이어야 합니다.' }, { status: 400 })
      }
      data.strategy = typeof body.strategy === 'string' ? body.strategy.trim() || null : null
    }

    if (body.horizon !== undefined) {
      if (body.horizon === null) {
        data.horizon = null
      } else if (typeof body.horizon === 'number' && Number.isInteger(body.horizon) && body.horizon > 0) {
        data.horizon = body.horizon
      } else {
        return NextResponse.json({ error: '투자 기간은 양의 정수여야 합니다.' }, { status: 400 })
      }
    }

    if (body.benchmarkTicker !== undefined) {
      if (body.benchmarkTicker !== null && typeof body.benchmarkTicker !== 'string') {
        return NextResponse.json({ error: '벤치마크는 문자열이어야 합니다.' }, { status: 400 })
      }
      data.benchmarkTicker = typeof body.benchmarkTicker === 'string' ? body.benchmarkTicker.trim() || null : null
    }

    if (body.ownerAge !== undefined) {
      if (body.ownerAge === null) {
        data.ownerAge = null
      } else if (typeof body.ownerAge === 'number' && Number.isInteger(body.ownerAge) && body.ownerAge >= 0) {
        data.ownerAge = body.ownerAge
      } else {
        return NextResponse.json({ error: '나이는 0 이상의 정수여야 합니다.' }, { status: 400 })
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: '수정할 필드가 없습니다.' }, { status: 400 })
    }

    const updated = await prisma.account.update({
      where: { id },
      data,
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: '계좌를 찾을 수 없습니다.' }, { status: 404 })
    }
    console.error('PATCH /api/accounts/[id] error:', error)
    return NextResponse.json({ error: '계좌 수정에 실패했습니다.' }, { status: 500 })
  }
}
