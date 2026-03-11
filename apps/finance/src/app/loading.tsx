export default function Loading() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-5 sm:py-7 max-w-[960px]">
      {/* Header skeleton */}
      <div className="sticky top-0 z-40 px-4 sm:px-8 py-4 sm:py-5 bg-[rgba(7,8,12,0.85)] backdrop-blur-xl border-b border-border">
        <div className="animate-pulse">
          <div className="h-4 bg-white/[0.06] rounded w-32 mb-1.5" />
          <div className="h-3 bg-white/[0.04] rounded w-48" />
        </div>
      </div>

      {/* Content skeleton */}
      <div className="mt-6 space-y-4">
        <div className="animate-pulse rounded-[14px] border border-border bg-card p-5">
          <div className="h-5 bg-white/[0.06] rounded w-40 mb-4" />
          <div className="space-y-3">
            <div className="h-4 bg-white/[0.04] rounded w-full" />
            <div className="h-4 bg-white/[0.04] rounded w-3/4" />
            <div className="h-4 bg-white/[0.04] rounded w-1/2" />
          </div>
        </div>
        <div className="animate-pulse rounded-[14px] border border-border bg-card p-5">
          <div className="h-5 bg-white/[0.06] rounded w-36 mb-4" />
          <div className="space-y-3">
            <div className="h-4 bg-white/[0.04] rounded w-full" />
            <div className="h-4 bg-white/[0.04] rounded w-5/6" />
          </div>
        </div>
      </div>
    </div>
  )
}
