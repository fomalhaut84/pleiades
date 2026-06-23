import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  validateIncomeProfileInput,
  calcTaxableFromGross,
  type IncomeProfileInput,
} from '@/lib/tax/income-profile-utils'
import { ok, fail, noContent } from '@/lib/api-response'

function handlePrismaError(error: unknown, context: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2025') {
      return fail('프로필을 찾을 수 없습니다.', 404)
    }
    if (error.code === 'P2002') {
      return fail('해당 연도 프로필이 이미 존재합니다.', 409)
    }
  }
  console.error(`${context} error:`, error)
  return fail(`${context}에 실패했습니다.`, 500)
}

/** PUT /api/income-profiles/[id] — 수정 */
export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { id } = params

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return fail('잘못된 요청 형식입니다.', 400)
    }

    const errors = validateIncomeProfileInput(body)
    if (errors.length > 0) {
      return fail(errors[0].message, 400)
    }

    const { year, inputType, prepaidTax, note } = body as IncomeProfileInput

    let grossSalary: number | null = null
    let earnedDeduction: number | null = null
    let taxableIncome: number

    if (inputType === 'gross') {
      grossSalary = Math.round((body as IncomeProfileInput).grossSalary!)
      const calc = calcTaxableFromGross(grossSalary)
      earnedDeduction = calc.earnedDeduction
      taxableIncome = calc.taxableIncome
    } else {
      taxableIncome = Math.round((body as IncomeProfileInput).taxableIncome!)
    }

    const profile = await prisma.incomeProfile.update({
      where: { id },
      data: {
        year,
        inputType,
        grossSalary,
        earnedDeduction,
        taxableIncome,
        prepaidTax: Math.round(prepaidTax ?? 0),
        note: typeof note === 'string' ? note.trim() || null : null,
      },
    })

    return ok(profile)
  } catch (error) {
    return handlePrismaError(error, '근로소득 프로필 수정')
  }
}

/** DELETE /api/income-profiles/[id] — 삭제 */
export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { id } = params
    await prisma.incomeProfile.delete({ where: { id } })
    return noContent()
  } catch (error) {
    return handlePrismaError(error, '근로소득 프로필 삭제')
  }
}
