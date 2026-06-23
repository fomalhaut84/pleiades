import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateDepositInput } from '@/lib/deposit-utils'
import { isGiftSource } from '@/lib/tax/gift-tax'
import { checkGiftTaxLimit } from '@/bot/notifications/budget-alert'
import { paginationSchema, yearSchema } from '@/lib/zod-schemas'
import { zodErrorsToValidation } from '@/lib/zod-utils'
import { ok, fail, paginated } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl

    const paginationResult = paginationSchema.safeParse({
      limit: searchParams.get('limit'),
      offset: searchParams.get('offset'),
    })
    if (!paginationResult.success) {
      const errs = zodErrorsToValidation(paginationResult.error)
      return fail(errs[0].message, 400)
    }
    const { limit, offset } = paginationResult.data

    const yearResult = yearSchema.safeParse(searchParams.get('year'))
    if (!yearResult.success) {
      const errs = zodErrorsToValidation(yearResult.error)
      return fail(errs[0].message, 400)
    }
    const year = yearResult.data

    const accountId = searchParams.get('accountId')
    const assetId = searchParams.get('assetId')

    const where: Record<string, unknown> = {}
    if (accountId) where.accountId = accountId
    if (assetId) where.assetId = assetId
    if (year !== undefined) {
      where.depositedAt = {
        gte: new Date(`${year}-01-01`),
        lt: new Date(`${year + 1}-01-01`),
      }
    }

    const [deposits, total] = await Promise.all([
      prisma.deposit.findMany({
        where,
        orderBy: [{ depositedAt: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
        include: {
          account: { select: { name: true } },
          asset: { select: { name: true } },
        },
      }),
      prisma.deposit.count({ where }),
    ])

    return paginated(deposits, total, limit, offset)
  } catch (error) {
    console.error('GET /api/deposits error:', error)
    return fail('입금 내역을 불러올 수 없습니다.', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return fail('잘못된 요청 형식입니다.', 400)
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return fail('잘못된 요청 형식입니다.', 400)
    }
    const errors = validateDepositInput(body as Record<string, unknown>)
    if (errors.length > 0) {
      return fail(errors[0].message, 400)
    }

    const { accountId, assetId, amount, source, note, depositedAt } = body as Record<string, unknown>

    if (note !== undefined && note !== null && typeof note !== 'string') {
      return fail('메모는 문자열이어야 합니다.', 400)
    }

    if (accountId) {
      const account = await prisma.account.findUnique({ where: { id: accountId as string } })
      if (!account) return fail('계좌를 찾을 수 없습니다.', 404)
    }
    if (assetId) {
      const asset = await prisma.asset.findUnique({ where: { id: assetId as string } })
      if (!asset) return fail('자산을 찾을 수 없습니다.', 404)
    }

    const roundedAmount = Math.round(amount as number)
    if (roundedAmount <= 0) {
      return fail('금액은 1원 이상이어야 합니다.', 400)
    }

    const deposit = await prisma.$transaction(async (tx) => {
      const created = await tx.deposit.create({
        data: {
          accountId: accountId ? (accountId as string) : null,
          assetId: assetId ? (assetId as string) : null,
          amount: roundedAmount,
          source: (source as string).trim(),
          note: typeof note === 'string' ? (note.trim() || null) : null,
          depositedAt: new Date(depositedAt as string),
        },
      })

      if (assetId) {
        await tx.asset.update({
          where: { id: assetId as string },
          data: { value: { increment: roundedAmount } },
        })
      }

      return created
    })

    if (isGiftSource((source as string).trim()) && accountId) {
      checkGiftTaxLimit(accountId as string).catch((e) =>
        console.error('[notification] 증여세 한도 체크 실패:', e)
      )
    }

    return ok(deposit, { status: 201 })
  } catch (error) {
    console.error('POST /api/deposits error:', error)
    return fail('입금 기록에 실패했습니다.', 500)
  }
}
