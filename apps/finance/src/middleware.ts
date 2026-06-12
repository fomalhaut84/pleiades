import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

// Auth.js v5: auth()를 미들웨어로 직접 export하면 req.auth로 세션 접근 가능
export default auth((request) => {
  if (!request.auth) {
    // API 요청은 401 JSON 반환 (리다이렉트하면 클라이언트 파싱 에러)
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
    }

    const signInUrl = new URL('/auth/signin', request.url)
    const returnUrl = request.nextUrl.pathname + request.nextUrl.search
    signInUrl.searchParams.set('callbackUrl', returnUrl)
    return NextResponse.redirect(signInUrl)
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    /*
     * 아래 경로를 제외한 모든 요청에 미들웨어 적용:
     * - /auth/ (로그인 페이지)
     * - /api/auth/ (NextAuth API)
     * - /_next/ (Next.js 내부)
     * - /favicon.ico, /icons/, /manifest.json (정적 리소스)
     * - /sw.js (서비스 워커)
     * - /offline (오프라인 페이지)
     */
    '/((?!auth/|api/auth/|_next/|favicon\\.ico|icons/|manifest\\.json|sw\\.js$|offline$).*)',
  ],
}
