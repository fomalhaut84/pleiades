import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  validateIncomeProfileInput,
  calcTaxableFromGross,
  type IncomeProfileInput,
} from '@/lib/tax/income-profile-utils'

function handlePrismaError(error: unknown, context: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2025') {
      return NextResponse.json({ error: '프로필을 찾을 수 없습니다.' }, { status: 404 })
    }
    if (error.code === 'P2002') {
      return NextResponse.json({ error: '해당 연도 프로필이 이미 존재합니다.' }, { status: 409 })
    }
  }
  console.error(`${context} error:`, error)
  return NextResponse.json({ error: `${context}에 실패했습니다.` }, { status: 500 })
}

/** PUT /api/income-profiles/[id] — 수정 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { id } = params

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 })
    }

    const errors = validateIncomeProfileInput(body)
    if (errors.length > 0) {
      return NextResponse.json({ error: errors[0].message, errors }, { status: 400 })
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

    return NextResponse.json(profile)
  } catch (error) {
    return handlePrismaError(error, '근로소득 프로필 수정')
  }
}

/** DELETE /api/income-profiles/[id] — 삭제 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { id } = params
    await prisma.incomeProfile.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return handlePrismaError(error, '근로소득 프로필 삭제')
  }
}
