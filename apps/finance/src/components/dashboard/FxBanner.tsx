import { formatPercent } from '@/lib/format'

interface FxBannerProps {
  fxRate: number | null
  fxChange: number | null
  fxChangePercent: number | null
}

export default function FxBanner({ fxRate, fxChange, fxChangePercent }: FxBannerProps) {
  if (fxRate == null) return null

  const isPositive = (fxChange ?? 0) >= 0

  return (
    <div className="flex items-center gap-2 px-3.5 py-2 bg-white/[0.02] border border-border rounded-lg text-[12px] text-sub w-fit mb-5">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
        <circle cx="5.5" cy="8" r="4" />
        <circle cx="10.5" cy="8" r="4" />
      </svg>
      <span>USD/KRW</span>
      <span className="font-bold text-bright">
        {fxRate.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
      {fxChange != null && fxChangePercent != null && (
        <span className={`font-semibold ${isPositive ? 'text-sejin' : 'text-red-500'}`}>
          {isPositive ? '+' : ''}{fxChange.toFixed(2)} ({formatPercent(fxChangePercent)})
        </span>
      )}
    </div>
  )
}
