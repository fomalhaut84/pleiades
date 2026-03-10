import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  validateIncomeProfileInput,
  calcTaxableFromGross,
  type IncomeProfileInput,
} from '@/lib/tax/income-profile-utils'

export const dynamic = 'force-dynamic'

/** GET /api/income-profiles — 목록 조회 */
export async function GET() {
  try {
    const profiles = await prisma.incomeProfile.findMany({
      orderBy: { year: 'desc' },
    })
    return NextResponse.json(profiles)
  } catch (error) {
    console.error('GET /api/income-profiles error:', error)
    return NextResponse.json(
      { error: '근로소득 프로필 조회에 실패했습니다.' },
      { status: 500 },
    )
  }
}

/** POST /api/income-profiles — 생성 */
export async function POST(request: NextRequest) {
  try {
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

    // 서버 측 파생값 계산
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

    const profile = await prisma.incomeProfile.create({
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

    return NextResponse.json(profile, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { error: '해당 연도 프로필이 이미 존재합니다. 수정을 이용해주세요.' },
        { status: 409 },
      )
    }
    console.error('POST /api/income-profiles error:', error)
    return NextResponse.json(
      { error: '근로소득 프로필 생성에 실패했습니다.' },
      { status: 500 },
    )
  }
}
