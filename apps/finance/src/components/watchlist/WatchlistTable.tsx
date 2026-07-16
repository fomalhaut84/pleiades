'use client'

import { formatKRW, formatUSD } from '@/lib/format'
import IconButton from '@/components/ui/IconButton'

function formatPrice(value: number, market: string): string {
  return market === 'US' ? formatUSD(value) : formatKRW(value)
}

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

const EditIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M11.5 2.5l2 2M2 11l-0.5 3.5 3.5-0.5 8.5-8.5-3-3L2 11z" />
  </svg>
)

const DeleteIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4" />
  </svg>
)

function isNearTargetPrice(item: WatchlistRow): boolean {
  return item.currentPrice !== null && item.targetBuy !== null && item.currentPrice <= item.targetBuy
}

function isInEntryRange(item: WatchlistRow): boolean {
  return item.currentPrice !== null
    && item.entryLow !== null
    && item.entryHigh !== null
    && item.currentPrice >= item.entryLow
    && item.currentPrice <= item.entryHigh
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
        <>
          {/* Mobile 카드 뷰 (<lg) — 손가락 스와이프 없이 종목 · 전략 · 현재가 · 목표가 한눈에 */}
          <div className="lg:hidden divide-y divide-border">
            {items.map((item) => {
              const highlight = isNearTargetPrice(item) || isInEntryRange(item)
              return (
                <div key={item.id} className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-0.5">
                        <span className="text-[13px] font-bold text-bright truncate">{item.displayName}</span>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${STRATEGY_COLORS[item.strategy] ?? 'text-sub border-border'}`}>
                          {item.strategy}
                        </span>
                      </div>
                      <div className="text-[11px] text-dim">{item.ticker} · {item.market}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-[13px] font-semibold tabular-nums ${highlight ? 'text-emerald-400' : 'text-bright'}`}>
                        {item.currentPrice !== null ? formatPrice(item.currentPrice, item.market) : '-'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] text-sub tabular-nums min-w-0 flex flex-wrap gap-x-3 gap-y-0.5">
                      {item.targetBuy !== null && (
                        <span>목표 {formatPrice(item.targetBuy, item.market)}</span>
                      )}
                      {item.entryLow !== null && item.entryHigh !== null && (
                        <span>구간 {formatPrice(item.entryLow, item.market)} ~ {formatPrice(item.entryHigh, item.market)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <IconButton onClick={() => onEdit(item)} title="수정">
                        <EditIcon />
                      </IconButton>
                      <IconButton variant="danger" onClick={() => onDelete(item)} title="삭제">
                        <DeleteIcon />
                      </IconButton>
                    </div>
                  </div>
                  {item.memo && (
                    <div className="text-[11px] text-dim mt-1.5 truncate">{item.memo}</div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Desktop 테이블 (lg:) */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border bg-surface-dim">
                  <th className="px-4 py-2.5 text-left text-dim font-semibold tracking-wide uppercase">종목</th>
                  <th className="px-4 py-2.5 text-left text-dim font-semibold tracking-wide uppercase">전략</th>
                  <th className="px-4 py-2.5 text-right text-dim font-semibold tracking-wide uppercase">현재가</th>
                  <th className="px-4 py-2.5 text-right text-dim font-semibold tracking-wide uppercase">목표가</th>
                  <th className="px-4 py-2.5 text-right text-dim font-semibold tracking-wide uppercase">매수 구간</th>
                  <th className="px-4 py-2.5 text-left text-dim font-semibold tracking-wide uppercase">메모</th>
                  <th className="px-4 py-2.5 text-center text-dim font-semibold tracking-wide uppercase w-[110px]">액션</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const highlight = isNearTargetPrice(item) || isInEntryRange(item)

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
                      <td className={`px-4 py-3 text-right font-semibold tabular-nums ${highlight ? 'text-emerald-400' : 'text-bright'}`}>
                        {item.currentPrice !== null ? formatPrice(item.currentPrice, item.market) : '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-sub tabular-nums">
                        {item.targetBuy !== null ? formatPrice(item.targetBuy, item.market) : '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-sub tabular-nums whitespace-nowrap">
                        {item.entryLow !== null && item.entryHigh !== null
                          ? `${formatPrice(item.entryLow, item.market)} ~ ${formatPrice(item.entryHigh, item.market)}`
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-sub max-w-[200px] truncate">
                        {item.memo ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <IconButton onClick={() => onEdit(item)} title="수정">
                          <EditIcon />
                        </IconButton>
                        <IconButton variant="danger" onClick={() => onDelete(item)} title="삭제">
                          <DeleteIcon />
                        </IconButton>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
