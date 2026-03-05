'use client'

import { useRouter } from 'next/navigation'
import Card from '@/components/ui/Card'
import { formatKRW, formatPercent, formatSignedKRW } from '@/lib/format'

interface AccountSummaryCardProps {
  id: string
  name: string
  ownerAge: number | null
  strategy: string | null
  currentValueKRW: number
  returnPct: number
  dailyChangeKRW: number
  holdingsCount: number
  usCount: number
  krCount: number
  hasPriceData: boolean
}

const COLOR_MAP: Record<string, { color: string; text: string; bg: string }> = {
  '세진': { color: '#34d399', text: 'text-sejin', bg: 'bg-sejin' },
  '소담': { color: '#60a5fa', text: 'text-sodam', bg: 'bg-sodam' },
  '다솜': { color: '#fb923c', text: 'text-dasom', bg: 'bg-dasom' },
}

export default function AccountSummaryCard({
  id,
  name,
  ownerAge,
  strategy,
  currentValueKRW,
  returnPct,
  dailyChangeKRW,
  holdingsCount,
  usCount,
  krCount,
  hasPriceData,
}: AccountSummaryCardProps) {
  const router = useRouter()
  const colors = COLOR_MAP[name] ?? { color: '#9494a8', text: 'text-sub', bg: 'bg-sub' }

  return (
    <Card
      glowColor={colors.color}
      clickable
      onClick={() => router.push(`/accounts/${id}`)}
    >
      <div className={`w-7 h-[3px] rounded-sm ${colors.bg} mb-3.5`} />
      <div className="text-[15px] font-extrabold text-bright mb-0.5">
        {name}
        {ownerAge != null && (
          <span className="text-[11px] font-medium text-sub ml-1.5">
            {ownerAge}세
          </span>
        )}
      </div>
      <div className="text-[12px] text-sub mb-3.5">{strategy}</div>
      <div className={`text-[22px] font-extrabold tracking-tight mb-1 ${colors.text}`}>
        {formatKRW(currentValueKRW)}
      </div>
      {hasPriceData && (
        <div className="flex items-baseline gap-2 mb-2">
          <span className={`text-[13px] font-bold ${returnPct >= 0 ? 'text-sejin' : 'text-red-500'}`}>
            {formatPercent(returnPct)}
          </span>
          <span className={`text-[11px] font-semibold ${dailyChangeKRW >= 0 ? 'text-sejin/70' : 'text-red-500/70'}`}>
            오늘 {formatSignedKRW(dailyChangeKRW)}
          </span>
        </div>
      )}
      <div className="text-[12px] text-dim">
        {holdingsCount}종목 · US {usCount} · KR {krCount}
      </div>
    </Card>
  )
}
