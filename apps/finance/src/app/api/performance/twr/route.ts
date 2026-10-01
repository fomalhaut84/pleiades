import { NextRequest } from 'next/server'
import { calculateTWR } from '@/lib/performance/twr'
import { VALID_PERIODS } from '@/lib/performance/constants'
import { ok, fail } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

/**
 * GET /api/performance/twr?accountId=xxx&period=3M
 * TWR + 벤치마크 수익률 + 알파
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const accountId = searchParams.get('accountId')
    const period = searchParams.get('period') ?? '3M'

    if (!accountId) {
      return fail('accountId는 필수입니다.', 400)
    }

    if (!VALID_PERIODS.includes(period)) {
      return fail(`유효한 기간: ${VALID_PERIODS.join(', ')}`, 400)
    }

    const result = await calculateTWR(accountId, period)
    return ok(result)
  } catch (error) {
    console.error('GET /api/performance/twr error:', error)
    return fail('TWR 계산에 실패했습니다.', 500)
  }
}
