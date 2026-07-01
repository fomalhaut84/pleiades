import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api-response'
import { parseStrategyText } from '@/lib/custom-strategy/parser'

export const dynamic = 'force-dynamic'

/**
 * POST /api/custom-strategies/preview — 자연어 파싱만 (DB 저장 X).
 *
 * 웹 등록 폼에서 "미리보기" 버튼으로 사용. 확정 후 POST /api/custom-strategies 로 저장.
 * askAdvisor subprocess 호출 → 최대 60s 소요 가능.
 */
export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return fail('유효한 JSON 형식이 아닙니다.', 400)
    }

    const text = typeof body.text === 'string' ? body.text.trim() : ''
    if (!text) return fail('전략 텍스트를 입력해주세요.', 400)
    if (text.length > 500) return fail('전략 텍스트는 500자 이하여야 합니다.', 400)

    let parsed
    try {
      parsed = await parseStrategyText(text)
    } catch (error) {
      const msg = error instanceof Error ? error.message : '전략 파싱에 실패했습니다.'
      return fail(msg, 400)
    }

    return ok(parsed)
  } catch (error) {
    console.error('[api/custom-strategies/preview] 실패:', error)
    return fail('전략 미리보기에 실패했습니다.', 500)
  }
}
