import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api-response'
import { getRsuVestPreview, RsuVestError } from '@/lib/rsu-vest-service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/rsu/[id]/vest-preview
 *
 * RSU 베스팅 처리 전 미리보기:
 * - 스케줄 정보 (수량, 매도/보유, 베스팅일)
 * - 자동 조회된 종가 (yahoo finance) + 출처 표시
 * - autoSell 기본값
 *
 * 종가 조회 실패 시 vestPrice=null + vestPriceSource='fallback' — 사용자가 수동 입력.
 */
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const preview = await getRsuVestPreview(params.id)
    return ok(preview)
  } catch (error) {
    if (error instanceof RsuVestError) {
      if (error.code === 'NOT_FOUND') return fail('RSU 스케줄을 찾을 수 없습니다.', 404)
      if (error.code === 'ALREADY_VESTED') return fail('이미 베스팅 처리된 스케줄입니다.', 400)
    }
    console.error('GET /api/rsu/[id]/vest-preview error:', error)
    return fail('미리보기를 불러올 수 없습니다.', 500)
  }
}
