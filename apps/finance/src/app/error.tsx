'use client'

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="text-center max-w-md">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-[16px] font-bold text-bright mb-2">
          문제가 발생했습니다
        </h2>
        <p className="text-[13px] text-sub mb-6">
          {error.message || '페이지를 불러오는 중 오류가 발생했습니다.'}
        </p>
        <button
          type="button"
          onClick={reset}
          className="px-5 py-2.5 rounded-lg bg-white/[0.07] text-bright text-[13px] font-semibold border border-white/[0.12] hover:bg-white/[0.1] transition-colors"
        >
          다시 시도
        </button>
      </div>
    </div>
  )
}
