import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { ok, fail } from '@/lib/api-response'

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
      return fail('계좌를 찾을 수 없습니다.', 404)
    }

    return ok(account)
  } catch (error) {
    console.error('GET /api/accounts/[id] error:', error)
    return fail('계좌 정보를 불러올 수 없습니다.', 500)
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
      return fail('유효한 JSON 형식이 아닙니다.', 400)
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return fail('유효한 JSON 객체가 아닙니다.', 400)
    }

    const data: Record<string, unknown> = {}

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        return fail('계좌 이름을 입력해주세요.', 400)
      }
      data.name = body.name.trim()
    }

    if (body.strategy !== undefined) {
      if (body.strategy !== null && typeof body.strategy !== 'string') {
        return fail('전략은 문자열이어야 합니다.', 400)
      }
      data.strategy = typeof body.strategy === 'string' ? body.strategy.trim() || null : null
    }

    if (body.horizon !== undefined) {
      if (body.horizon === null) {
        data.horizon = null
      } else if (typeof body.horizon === 'number' && Number.isInteger(body.horizon) && body.horizon > 0) {
        data.horizon = body.horizon
      } else {
        return fail('투자 기간은 양의 정수여야 합니다.', 400)
      }
    }

    if (body.benchmarkTicker !== undefined) {
      if (body.benchmarkTicker !== null && typeof body.benchmarkTicker !== 'string') {
        return fail('벤치마크는 문자열이어야 합니다.', 400)
      }
      data.benchmarkTicker = typeof body.benchmarkTicker === 'string' ? body.benchmarkTicker.trim() || null : null
    }

    if (body.ownerAge !== undefined) {
      if (body.ownerAge === null) {
        data.ownerAge = null
      } else if (typeof body.ownerAge === 'number' && Number.isInteger(body.ownerAge) && body.ownerAge >= 0) {
        data.ownerAge = body.ownerAge
      } else {
        return fail('나이는 0 이상의 정수여야 합니다.', 400)
      }
    }

    if (Object.keys(data).length === 0) {
      return fail('수정할 필드가 없습니다.', 400)
    }

    const updated = await prisma.account.update({
      where: { id },
      data,
    })

    return ok(updated)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return fail('계좌를 찾을 수 없습니다.', 404)
    }
    console.error('PATCH /api/accounts/[id] error:', error)
    return fail('계좌 수정에 실패했습니다.', 500)
  }
}
