import { formatKRW, formatUSD, calcCostKRW } from '@/lib/format'

interface Holding {
  id: string
  displayName: string
  market: string
  shares: number
  avgPrice: number
  currency: string
  avgFxRate: number | null
}

interface HoldingsTableProps {
  holdings: Holding[]
}

export default function HoldingsTable({ holdings }: HoldingsTableProps) {
  const sorted = [...holdings].sort(
    (a, b) => calcCostKRW(b) - calcCostKRW(a)
  )

  return (
    <div className="relative overflow-hidden rounded-[14px] border border-border bg-card">
      <div className="px-5 py-3.5 border-b border-border flex justify-between items-center">
        <div className="text-[13px] font-bold text-bright">보유종목</div>
        <div className="text-[12px] text-sub">{holdings.length}개</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="px-5 py-2.5 text-left text-[12px] font-semibold text-sub tracking-wide uppercase border-b border-border bg-white/[0.02]">
                종목
              </th>
              <th className="px-5 py-2.5 text-left text-[12px] font-semibold text-sub tracking-wide uppercase border-b border-border bg-white/[0.02]">
                시장
              </th>
              <th className="px-5 py-2.5 text-right text-[12px] font-semibold text-sub tracking-wide uppercase border-b border-border bg-white/[0.02]">
                수량
              </th>
              <th className="px-5 py-2.5 text-right text-[12px] font-semibold text-sub tracking-wide uppercase border-b border-border bg-white/[0.02]">
                평균단가
              </th>
              <th className="px-5 py-2.5 text-right text-[12px] font-semibold text-sub tracking-wide uppercase border-b border-border bg-white/[0.02]">
                매입금
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((h) => (
              <tr key={h.id} className="hover:bg-white/[0.015]">
                <td className="px-5 py-3 text-[13px] border-b border-white/[0.025]">
                  <span className="font-bold text-bright">{h.displayName}</span>
                </td>
                <td className="px-5 py-3 text-[13px] border-b border-white/[0.025]">
                  <span
                    className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                      h.market === 'US'
                        ? 'text-sodam bg-sodam/10'
                        : 'text-amber-400 bg-amber-400/10'
                    }`}
                  >
                    {h.market}
                  </span>
                </td>
                <td className="px-5 py-3 text-[13px] text-right border-b border-white/[0.025]">
                  {h.shares}주
                </td>
                <td className="px-5 py-3 text-right border-b border-white/[0.025]">
                  <div className={h.currency === 'USD' ? 'text-[11px] text-sub' : 'text-[13px] text-muted font-semibold'}>
                    {h.currency === 'USD' ? formatUSD(h.avgPrice) : formatKRW(h.avgPrice)}
                  </div>
                </td>
                <td className="px-5 py-3 text-right border-b border-white/[0.025]">
                  <span className="font-semibold text-muted tabular-nums">
                    {formatKRW(calcCostKRW(h))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
