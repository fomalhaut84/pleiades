import Link from 'next/link'

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="text-center max-w-md">
        <div className="text-5xl mb-4 text-dim">404</div>
        <h2 className="text-[16px] font-bold text-bright mb-2">
          페이지를 찾을 수 없습니다
        </h2>
        <p className="text-[13px] text-sub mb-6">
          요청하신 페이지가 존재하지 않거나 이동되었습니다.
        </p>
        <Link
          href="/"
          className="px-5 py-2.5 rounded-lg bg-white/[0.07] text-bright text-[13px] font-semibold border border-white/[0.12] hover:bg-white/[0.1] transition-colors"
        >
          대시보드로 이동
        </Link>
      </div>
    </div>
  )
}
