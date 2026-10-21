import NextAuth, { CredentialsSignin } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'

// Auth.js v5는 authorize 내부에서 throw된 일반 Error의 message를 클라이언트로
// 노출하지 않고 모두 'CredentialsSignin'으로 sanitize한다.
// CredentialsSignin을 상속하면 code 필드가 client signIn 결과로 전달돼,
// signin 페이지에서 케이스별 메시지 분기가 가능해진다.
class RateLimitedError extends CredentialsSignin {
  code = 'rate_limited'
}
class MissingAuthPinError extends CredentialsSignin {
  code = 'missing_auth_pin'
}

const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 5 * 60 * 1000 // 5분
const MAX_ENTRIES = 1000

const failedAttempts = new Map<string, { count: number; lastAttempt: number }>()

function pruneExpired(): void {
  if (failedAttempts.size <= MAX_ENTRIES) return
  const now = Date.now()
  // 만료된 엔트리 정리
  failedAttempts.forEach((record, key) => {
    if (now - record.lastAttempt > LOCKOUT_MS) {
      failedAttempts.delete(key)
    }
  })
  // 하드 캡: 여전히 초과 시 가장 오래된 엔트리 제거
  if (failedAttempts.size > MAX_ENTRIES) {
    let oldestKey: string | null = null
    let oldestTime = Infinity
    failedAttempts.forEach((record, key) => {
      if (record.lastAttempt < oldestTime) {
        oldestTime = record.lastAttempt
        oldestKey = key
      }
    })
    if (oldestKey) failedAttempts.delete(oldestKey)
  }
}

function checkRateLimit(key: string): boolean {
  const now = Date.now()
  const record = failedAttempts.get(key)

  if (!record) return true

  if (now - record.lastAttempt > LOCKOUT_MS) {
    failedAttempts.delete(key)
    return true
  }

  return record.count < MAX_ATTEMPTS
}

function recordFailure(key: string): void {
  const now = Date.now()
  const record = failedAttempts.get(key)

  if (!record || now - record.lastAttempt > LOCKOUT_MS) {
    failedAttempts.set(key, { count: 1, lastAttempt: now })
  } else {
    failedAttempts.set(key, { count: record.count + 1, lastAttempt: now })
  }

  pruneExpired()
}

function clearFailures(key: string): void {
  failedAttempts.delete(key)
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // v5는 AUTH_SECRET을 우선 사용하고, NEXTAUTH_SECRET도 자동 fallback한다
  // (node_modules/next-auth/lib/env.js). 명시적 지정 없음.
  providers: [
    Credentials({
      name: 'PIN',
      credentials: {
        pin: { label: 'PIN', type: 'password' },
      },
      async authorize(credentials, request) {
        const pin = process.env.AUTH_PIN
        if (!pin) {
          throw new MissingAuthPinError()
        }

        // v5에서는 Request 객체로 헤더 접근 (next-auth v4는 NodeJS req였음)
        const forwarded = request.headers.get('x-forwarded-for')
        const rateLimitKey = forwarded?.split(',')[0]?.trim() || 'unknown'

        if (!checkRateLimit(rateLimitKey)) {
          throw new RateLimitedError()
        }

        if (credentials?.pin === pin) {
          clearFailures(rateLimitKey)
          return { id: 'admin', name: '세진', role: 'admin' }
        }

        recordFailure(rateLimitKey)
        return null
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30일
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role
      }
      return session
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
})
