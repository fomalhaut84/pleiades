import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { validateDividendInput, calcAmountKRW } from '@/lib/dividend-utils'
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
    const ticker = searchParams.get('ticker')

    const where: Record<string, unknown> = {}
    if (accountId) where.accountId = accountId
    if (ticker) where.ticker = ticker
    if (year !== undefined) {
      where.payDate = {
        gte: new Date(`${year}-01-01`),
        lt: new Date(`${year + 1}-01-01`),
      }
    }

    const [dividends, total] = await Promise.all([
      prisma.dividend.findMany({
        where,
        orderBy: [{ payDate: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
        include: { account: { select: { name: true } } },
      }),
      prisma.dividend.count({ where }),
    ])

    return paginated(dividends, total, limit, offset)
  } catch (error) {
    console.error('GET /api/dividends error:', error)
    return fail('배당 내역을 불러올 수 없습니다.', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const errors = validateDividendInput(body)
    if (errors.length > 0) {
      return fail(errors[0].message, 400)
    }

    const { accountId, displayName, exDate, payDate, amountGross, amountNet, taxAmount, currency, fxRate, reinvested } = body
    const ticker = (body.ticker as string).toUpperCase().trim()

    // 옵션 필드 타입 검증
    if (exDate !== undefined && exDate !== null && (typeof exDate !== 'string' || isNaN(Date.parse(exDate)))) {
      return fail('유효한 기준일을 입력해주세요.', 400)
    }
    if (taxAmount !== undefined && taxAmount !== null && (typeof taxAmount !== 'number' || !Number.isFinite(taxAmount) || taxAmount < 0)) {
      return fail('세금은 0 이상이어야 합니다.', 400)
    }
    if (reinvested !== undefined && reinvested !== null && typeof reinvested !== 'boolean') {
      return fail('재투자 여부는 true/false여야 합니다.', 400)
    }

    // 교차 검증
    if (amountNet > amountGross) {
      return fail('세후 금액이 세전 금액을 초과할 수 없습니다.', 400)
    }
    if (taxAmount != null && taxAmount > amountGross) {
      return fail('세금이 세전 금액을 초과할 수 없습니다.', 400)
    }

    // 서버 측 amountKRW 재계산 (클라이언트 값 대신 서버 계산값 사용)
    const serverAmountKRW = calcAmountKRW(amountNet, currency, fxRate)

    const account = await prisma.account.findUnique({ where: { id: accountId } })
    if (!account) {
      return fail('계좌를 찾을 수 없습니다.', 404)
    }

    const dividend = await prisma.dividend.create({
      data: {
        accountId,
        ticker,
        displayName,
        exDate: exDate ? new Date(exDate) : null,
        payDate: new Date(payDate),
        amountGross,
        amountNet,
        taxAmount: taxAmount ?? null,
        currency,
        fxRate: currency === 'USD' ? fxRate : null,
        amountKRW: serverAmountKRW,
        reinvested: reinvested ?? false,
      },
    })

    return ok(dividend, { status: 201 })
  } catch (error) {
    console.error('POST /api/dividends error:', error)
    return fail('배당 기록에 실패했습니다.', 500)
  }
}
