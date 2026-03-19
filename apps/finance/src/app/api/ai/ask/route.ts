import { NextRequest, NextResponse } from 'next/server'
import {
  askAdvisor,
  AdvisorTimeoutError,
  AdvisorError,
} from '@/lib/ai/claude-advisor'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** 사용자 입력 검증 에러 메시지만 허용 */
const SAFE_ERROR_PREFIXES = ['질문을 입력해주세요', '질문이 너무 깁니다']

function isSafeError(msg: string): boolean {
  return SAFE_ERROR_PREFIXES.some((p) => msg.startsWith(p))
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: '잘못된 요청 형식입니다.' },
        { status: 400 }
      )
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { error: '잘못된 요청 형식입니다.' },
        { status: 400 }
      )
    }

    const { prompt } = body as { prompt?: unknown }

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json(
        { error: '질문을 입력해주세요.' },
        { status: 400 }
      )
    }

    const result = await askAdvisor(prompt.trim())

    return NextResponse.json({
      response: result.response,
      model: result.model,
      durationMs: result.durationMs,
      costUsd: result.costUsd,
    })
  } catch (error) {
    if (error instanceof AdvisorTimeoutError) {
      return NextResponse.json(
        { error: 'AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.' },
        { status: 504 }
      )
    }

    if (error instanceof AdvisorError && isSafeError(error.message)) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    console.error('POST /api/ai/ask error:', error)
    return NextResponse.json(
      { error: 'AI 응답 처리에 실패했습니다.' },
      { status: 500 }
    )
  }
}
