'use client'

import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FormEvent, useState } from 'react'

function safeCallbackUrl(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/auth')) return '/'
  return raw
}

export default function SignInPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = safeCallbackUrl(searchParams.get('callbackUrl'))
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await signIn('credentials', {
        pin,
        redirect: false,
        callbackUrl,
      })

      if (!result || result.error || !result.ok) {
        setError(
          result?.error?.includes('너무 많은 시도')
            ? '너무 많은 시도입니다. 5분 후 다시 시도하세요.'
            : 'PIN이 올바르지 않습니다',
        )
        setPin('')
        return
      }

      router.push(callbackUrl)
      router.refresh()
    } catch {
      setError('네트워크 오류가 발생했습니다. 다시 시도하세요.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-bg px-4">
      <div className="w-full max-w-[320px]">
        <div className="text-center mb-8">
          <h1 className="text-[20px] font-bold text-bright">myFinance</h1>
          <p className="text-[13px] text-sub mt-1">가족 자산관리 시스템</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-[14px] border border-border bg-card p-6"
        >
          <label
            htmlFor="pin"
            className="block text-[13px] font-semibold text-bright mb-2"
          >
            PIN 입력
          </label>
          <input
            id="pin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="current-password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="PIN을 입력하세요"
            className="w-full px-4 py-3 rounded-lg bg-white/[0.06] border border-border text-bright text-[14px] placeholder:text-dim focus:outline-none focus:border-white/[0.2] transition-colors"
            autoFocus
            disabled={loading}
          />

          {error && (
            <p className="text-red-400 text-[12px] mt-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !pin}
            className="w-full mt-4 px-4 py-3 rounded-lg bg-white/[0.1] text-bright text-[13px] font-semibold border border-white/[0.12] hover:bg-white/[0.15] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? '확인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}
