import { NextRequest, NextResponse } from 'next/server'
import { calculateContribution } from '@/lib/performance/contribution'
import { VALID_PERIODS } from '@/lib/performance/constants'

export const dynamic = 'force-dynamic'

/**
 * GET /api/performance/contribution?accountId=xxx&period=6M
 * 종목별 기여도 분석
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const accountId = searchParams.get('accountId')
    const period = searchParams.get('period') ?? '6M'

    if (!accountId) {
      return NextResponse.json({ error: 'accountId는 필수입니다.' }, { status: 400 })
    }

    if (!VALID_PERIODS.includes(period)) {
      return NextResponse.json(
        { error: `유효한 기간: ${VALID_PERIODS.join(', ')}` },
        { status: 400 }
      )
    }

    const result = await calculateContribution(accountId, period)
    return NextResponse.json(result)
  } catch (error) {
    console.error('GET /api/performance/contribution error:', error)
    return NextResponse.json({ error: '기여도 분석에 실패했습니다.' }, { status: 500 })
  }
}
