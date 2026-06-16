import { NextResponse } from 'next/server'

// 사용자에게 노출해도 안전한 비즈니스 예외 메시지를 식별하는 화이트리스트.
// 새 메시지를 추가할 때는 우연 매칭을 피하기 위해 메시지 형식을 명시적으로 잠근다.
const SAFE_BUSINESS_PATTERNS: ReadonlyArray<(msg: string) => boolean> = [
  (m) => m.startsWith('보유 수량 부족'),
  (m) => m.includes('보유 수량(') && m.includes('초과합니다'),
  (m) => m.includes('이미 ') && m.includes('등록되어 있'),
]

export function isSafeBusinessError(err: unknown): err is Error {
  return err instanceof Error && SAFE_BUSINESS_PATTERNS.some((p) => p(err.message))
}

export function businessErrorResponse(err: unknown): NextResponse | null {
  if (!isSafeBusinessError(err)) return null
  return NextResponse.json({ error: err.message }, { status: 400 })
}
