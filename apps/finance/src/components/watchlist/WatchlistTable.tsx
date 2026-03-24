'use client'

import { formatKRW } from '@/lib/format'

export interface WatchlistRow {
  id: string
  ticker: string
  displayName: string
  market: string
  strategy: string
  memo: string | null
  targetBuy: number | null
  entryLow: number | null
  entryHigh: number | null
  currentPrice: number | null
}

interface WatchlistTableProps {
  items: WatchlistRow[]
  onEdit: (item: WatchlistRow) => void
  onDelete: (item: WatchlistRow) => void
}

const STRATEGY_COLORS: Record<string, string> = {
  swing: 'bg-sodam/15 text-sodam border-sodam/25',
  momentum: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
  value: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  scalp: 'bg-red-500/15 text-red-400 border-red-500/25',
}

export default function WatchlistTable({ items, onEdit, onDelete }: WatchlistTableProps) {
  return (
    <div className="rounded-[14px] border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <span className="text-[13px] font-bold text-bright">관심종목</span>
        <span className="text-[11px] text-sub">{items.length}종목</span>
      </div>

      {items.length === 0 ? (
        <div className="px-5 py-10 text-center text-[13px] text-sub">관심종목이 없습니다.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border bg-surface-dim">
                <th className="px-4 py-2.5 text-left text-dim font-semibold tracking-wide uppercase">종목</th>
                <th className="px-4 py-2.5 text-left text-dim font-semibold tracking-wide uppercase">전략</th>
                <th className="px-4 py-2.5 text-right text-dim font-semibold tracking-wide uppercase">현재가</th>
                <th className="px-4 py-2.5 text-right text-dim font-semibold tracking-wide uppercase">목표가</th>
                <th className="px-4 py-2.5 text-right text-dim font-semibold tracking-wide uppercase">매수 구간</th>
                <th className="px-4 py-2.5 text-left text-dim font-semibold tracking-wide uppercase">메모</th>
                <th className="px-4 py-2.5 text-center text-dim font-semibold tracking-wide uppercase w-[70px]">액션</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const isNearTarget = item.currentPrice !== null && item.targetBuy !== null && item.currentPrice <= item.targetBuy
                const isInRange = item.currentPrice !== null && item.entryLow !== null && item.entryHigh !== null
                  && item.currentPrice >= item.entryLow && item.currentPrice <= item.entryHigh

                return (
                  <tr key={item.id} className="border-b border-border last:border-0 hover:bg-surface-dim transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-bright font-medium">{item.displayName}</div>
                      <div className="text-[11px] text-dim">{item.ticker} · {item.market}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STRATEGY_COLORS[item.strategy] ?? 'text-sub border-border'}`}>
                        {item.strategy}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold tabular-nums ${isNearTarget || isInRange ? 'text-emerald-400' : 'text-bright'}`}>
                      {item.currentPrice !== null ? formatKRW(item.currentPrice) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right text-sub tabular-nums">
                      {item.targetBuy !== null ? formatKRW(item.targetBuy) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right text-sub tabular-nums whitespace-nowrap">
                      {item.entryLow !== null && item.entryHigh !== null
                        ? `${formatKRW(item.entryLow)} ~ ${formatKRW(item.entryHigh)}`
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-sub max-w-[200px] truncate">
                      {item.memo ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <button onClick={() => onEdit(item)} className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-md text-dim hover:text-text hover:bg-surface transition-all" title="수정">
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11.5 2.5l2 2M2 11l-0.5 3.5 3.5-0.5 8.5-8.5-3-3L2 11z" /></svg>
                      </button>
                      <button onClick={() => onDelete(item)} className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-md text-dim hover:text-red-400 hover:bg-red-500/10 transition-all" title="삭제">
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4" /></svg>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
