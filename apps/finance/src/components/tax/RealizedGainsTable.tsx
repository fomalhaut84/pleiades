'use client'

import { formatKRW, formatUSD, formatDate } from '@/lib/format'
import type { RealizedGain } from '@/lib/tax/capital-gains-tax'

interface RealizedGainsTableProps {
  gains: RealizedGain[]
}

const MARKET_LABEL: Record<string, string> = {
  US: '해외주식',
  KR: '국내 ETF',
}

export default function RealizedGainsTable({ gains }: RealizedGainsTableProps) {
  if (gains.length === 0) return null

  const formatPrice = (amount: number, currency: string) =>
    currency === 'USD' ? formatUSD(amount) : formatKRW(amount)

  return (
    <div className="relative overflow-hidden rounded-[14px] border border-border bg-card">
      <div className="px-5 py-3.5 border-b border-border flex justify-between items-center">
        <div className="text-[13px] font-bold text-bright">매도 내역 상세</div>
        <div className="text-[12px] text-sub">{gains.length}건</div>
      </div>

      {/* Desktop table */}
      <div className="overflow-x-auto hidden sm:block">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['매도일', '종목', '구분', '수량', '매도가', '평균단가', '손익'].map((col, i) => (
                <th
                  key={i}
                  className={`px-3 py-2.5 text-[11px] font-semibold text-sub tracking-wide uppercase border-b border-border bg-white/[0.02] ${
                    i >= 3 ? 'text-right' : 'text-left'
                  } ${i === 0 ? 'pl-4' : ''} ${i === 6 ? 'pr-4' : ''}`}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gains.map((g) => (
              <tr key={g.tradeId} className="hover:bg-white/[0.015]">
                <td className="pl-4 px-3 py-3 text-[13px] text-muted border-b border-white/[0.025] tabular-nums whitespace-nowrap">
                  {formatDate(g.tradedAt)}
                </td>
                <td className="px-3 py-3 text-[13px] border-b border-white/[0.025]">
                  <span className="font-bold text-bright">{g.displayName}</span>
                  <span className="text-[11px] text-dim ml-1.5">{g.ticker}</span>
                </td>
                <td className="px-3 py-3 text-[11px] border-b border-white/[0.025]">
                  <span className="px-1.5 py-0.5 rounded bg-white/[0.04] text-dim">
                    {MARKET_LABEL[g.market] ?? g.market}
                  </span>
                </td>
                <td className="px-3 py-3 text-right text-[12px] text-muted border-b border-white/[0.025] tabular-nums">
                  {g.shares}주
                </td>
                <td className="px-3 py-3 text-right text-[12px] text-muted border-b border-white/[0.025] tabular-nums">
                  {formatPrice(g.sellPrice, g.currency)}
                </td>
                <td className="px-3 py-3 text-right text-[12px] text-dim border-b border-white/[0.025] tabular-nums">
                  {formatPrice(g.avgCostPrice, g.currency)}
                </td>
                <td className="pr-4 px-3 py-3 text-right border-b border-white/[0.025]">
                  <span className={`text-[13px] font-semibold tabular-nums ${
                    g.realizedGainKRW >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {g.realizedGainKRW >= 0 ? '+' : ''}{formatKRW(g.realizedGainKRW)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card view */}
      <div className="sm:hidden divide-y divide-white/[0.025]">
        {gains.map((g) => (
          <div key={g.tradeId} className="px-4 py-3.5 hover:bg-white/[0.015]">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-bold text-bright">{g.displayName}</span>
                <span className="text-[10px] text-dim px-1 py-0.5 rounded bg-white/[0.04]">
                  {MARKET_LABEL[g.market] ?? g.market}
                </span>
              </div>
              <span className={`text-[13px] font-semibold tabular-nums ${
                g.realizedGainKRW >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {g.realizedGainKRW >= 0 ? '+' : ''}{formatKRW(g.realizedGainKRW)}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-dim">
              <span className="tabular-nums">{formatDate(g.tradedAt)} · {g.shares}주</span>
              <span className="tabular-nums">
                {formatPrice(g.avgCostPrice, g.currency)} → {formatPrice(g.sellPrice, g.currency)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
