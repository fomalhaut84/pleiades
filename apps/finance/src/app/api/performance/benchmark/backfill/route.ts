import { backfillAllBenchmarks } from '@/lib/performance/benchmark'
import { ok, fail } from '@/lib/api-response'

export const dynamic = 'force-dynamic'

/**
 * POST /api/performance/benchmark/backfill
 * 벤치마크 1년 히스토리 backfill
 */
export async function POST() {
  try {
    const results = await backfillAllBenchmarks()
    return ok(results, { status: 201 })
  } catch (error) {
    console.error('POST /api/performance/benchmark/backfill error:', error)
    return fail('벤치마크 backfill에 실패했습니다.', 500)
  }
}
