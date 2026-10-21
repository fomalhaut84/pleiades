'use client'

export default function OfflinePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="text-center max-w-md">
        <div className="text-4xl mb-4 text-dim">offline</div>
        <h2 className="text-[16px] font-bold text-bright mb-2">
          오프라인 상태입니다
        </h2>
        <p className="text-[13px] text-sub mb-6">
          인터넷 연결을 확인한 후 다시 시도하세요.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-5 py-2.5 rounded-lg bg-surface text-bright text-[13px] font-semibold border border-border-hover hover:bg-surface-hover transition-colors"
        >
          다시 시도
        </button>
      </div>
    </div>
  )
}
