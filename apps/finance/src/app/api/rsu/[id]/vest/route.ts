import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api-response'
import { businessErrorResponse } from '@/lib/api-errors'
import { processRsuVest, RsuVestError, rsuVestErrorMessage } from '@/lib/rsu-vest-service'

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { id } = params

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return fail('유효한 JSON 요청을 보내주세요.', 400)
    }

    const { vestPrice, autoSell } = body as {
      vestPrice: number
      autoSell: boolean
    }

    if (typeof vestPrice !== 'number' || !Number.isFinite(vestPrice) || vestPrice <= 0) {
      return fail('베스팅일 종가는 0보다 큰 숫자여야 합니다.', 400)
    }
    if (typeof autoSell !== 'boolean') {
      return fail('autoSell은 boolean이어야 합니다.', 400)
    }

    const result = await processRsuVest(id, vestPrice, autoSell)
    return ok(result)
  } catch (error) {
    if (error instanceof RsuVestError) {
      // NOT_FOUND → 404, 상태/타이밍 충돌 → 409, 입력 검증 → 400
      const status =
        error.code === 'NOT_FOUND' ? 404
        : error.code === 'NOT_YET_VESTED' || error.code === 'PRICE_NOT_SETTLED' ? 409
        : 400
      return fail(rsuVestErrorMessage(error), status)
    }
    // recalcHolding 의 비즈니스 예외 (예: "보유 수량 부족: ...") 사용자에게 한국어 그대로 노출
    const businessResponse = businessErrorResponse(error)
    if (businessResponse) return businessResponse
    if (
      error != null &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'P2034'
    ) {
      return fail('동시 요청이 충돌했습니다. 잠시 후 다시 시도해주세요.', 409)
    }
    console.error('POST /api/rsu/[id]/vest error:', error)
    return fail('베스팅 처리에 실패했습니다.', 500)
  }
}
