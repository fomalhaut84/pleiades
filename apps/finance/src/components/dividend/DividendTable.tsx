'use client'

import { useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { formatKRW, formatUSD, formatDate } from '@/lib/format'
import DividendEditPanel from './DividendEditPanel'
import DividendDeleteModal from './DividendDeleteModal'

export interface DividendRow {
  id: string
  accountId: string
  ticker: string
  displayName: string
  exDate: string | null
  payDate: string
  amountGross: number
  amountNet: number
  taxAmount: number | null
  currency: string
  fxRate: number | null
  amountKRW: number
  reinvested: boolean
  account: { name: string }
}

interface DividendTableProps {
  dividends: DividendRow[]
  total: number
  limit: number
  offset: number
}

const ACCOUNT_DOT_COLORS: Record<string, string> = {
  '세진': 'bg-sejin',
  '소담': 'bg-sodam',
  '다솜': 'bg-dasom',
}

export default function DividendTable({ dividends, total, limit, offset }: DividendTableProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [editItem, setEditItem] = useState<DividendRow | null>(null)
  const [deleteItem, setDeleteItem] = useState<DividendRow | null>(null)

  const totalPages = Math.ceil(total / limit)
  const currentPage = Math.floor(offset / limit) + 1

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString())
    const newOffset = (page - 1) * limit
    if (newOffset > 0) {
      params.set('offset', String(newOffset))
    } else {
      params.delete('offset')
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  const formatAmount = (amount: number, currency: string) => {
    return currency === 'USD' ? formatUSD(amount) : formatKRW(amount)
  }

  if (total === 0) {
    return (
      <div className="relative overflow-hidden rounded-[14px] border border-border bg-card p-12 text-center">
        <div className="text-[14px] text-sub mb-4">배당 기록이 없습니다</div>
        <button
          onClick={() => router.push('/dividends/new')}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sodam/15 text-sodam text-[13px] font-semibold border border-sodam/25 hover:bg-sodam/25 transition-all"
        >
          + 배당 기록
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="relative overflow-hidden rounded-[14px] border border-border bg-card">
        <div className="px-5 py-3.5 border-b border-border flex justify-between items-center">
          <div className="text-[13px] font-bold text-bright">배당 목록</div>
          <div className="text-[12px] text-sub">{total}건</div>
        </div>

        {/* Desktop table */}
        <div className="overflow-x-auto hidden sm:block">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['지급일', '계좌', '종목', '세전', '세금', '세후', '원화', '재투자', ''].map((col, i) => (
                  <th
                    key={i}
                    className={`px-3 py-2.5 text-[11px] font-semibold text-sub tracking-wide uppercase border-b border-border bg-white/[0.02] ${
                      i >= 3 && i <= 6 ? 'text-right' : 'text-left'
                    } ${i === 0 ? 'pl-4' : ''} ${i === 8 ? 'pr-4 w-16' : ''}`}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dividends.map((d) => (
                <tr key={d.id} className="hover:bg-white/[0.015]">
                  <td className="pl-4 px-3 py-3 text-[13px] text-muted border-b border-white/[0.025] tabular-nums whitespace-nowrap">
                    {formatDate(d.payDate)}
                  </td>
                  <td className="px-3 py-3 text-[13px] border-b border-white/[0.025]">
                    <span className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${ACCOUNT_DOT_COLORS[d.account.name] ?? 'bg-dim'}`} />
                      <span className="text-muted">{d.account.name}</span>
                    </span>
                  </td>
                  <td className="px-3 py-3 text-[13px] border-b border-white/[0.025]">
                    <span className="font-bold text-bright">{d.displayName}</span>
                    <span className="text-[11px] text-dim ml-1.5">{d.ticker}</span>
                  </td>
                  <td className="px-3 py-3 text-right text-[12px] text-muted border-b border-white/[0.025] tabular-nums">
                    {formatAmount(d.amountGross, d.currency)}
                  </td>
                  <td className="px-3 py-3 text-right text-[12px] text-dim border-b border-white/[0.025] tabular-nums">
                    {d.taxAmount != null ? formatAmount(d.taxAmount, d.currency) : '-'}
                  </td>
                  <td className="px-3 py-3 text-right text-[12px] text-muted border-b border-white/[0.025] tabular-nums">
                    {formatAmount(d.amountNet, d.currency)}
                  </td>
                  <td className="px-3 py-3 text-right border-b border-white/[0.025]">
                    <span className="text-[13px] font-semibold text-muted tabular-nums">
                      {formatKRW(d.amountKRW)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center border-b border-white/[0.025]">
                    {d.reinvested && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sodam/10 text-sodam">
                        재투자
                      </span>
                    )}
                  </td>
                  <td className="pr-4 px-3 py-3 border-b border-white/[0.025]">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditItem(d)}
                        className="p-1.5 rounded-md text-dim hover:text-muted hover:bg-white/[0.05] transition-all"
                        title="수정"
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setDeleteItem(d)}
                        className="p-1.5 rounded-md text-dim hover:text-red-400 hover:bg-red-500/10 transition-all"
                        title="삭제"
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4m2 0v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile card view */}
        <div className="sm:hidden divide-y divide-white/[0.025]">
          {dividends.map((d) => (
            <div key={d.id} className="px-4 py-3.5 hover:bg-white/[0.015]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${ACCOUNT_DOT_COLORS[d.account.name] ?? 'bg-dim'}`} />
                  <span className="text-[13px] font-bold text-bright">{d.displayName}</span>
                  {d.reinvested && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sodam/10 text-sodam">
                      재투자
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditItem(d)}
                    className="p-1.5 rounded-md text-dim hover:text-muted hover:bg-white/[0.05] transition-all"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setDeleteItem(d)}
                    className="p-1.5 rounded-md text-dim hover:text-red-400 hover:bg-red-500/10 transition-all"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4m2 0v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-dim tabular-nums">{formatDate(d.payDate)}</span>
                <div className="text-right">
                  <span className="text-muted tabular-nums">{formatAmount(d.amountGross, d.currency)}</span>
                  <span className="text-sub font-semibold ml-2 tabular-nums">{formatKRW(d.amountKRW)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-5 py-3.5 border-t border-border flex items-center justify-between">
            <div className="text-[12px] text-dim">
              {offset + 1}–{Math.min(offset + limit, total)} / {total}건
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className="px-2.5 py-1.5 rounded-md text-[12px] text-sub border border-white/[0.06] hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                이전
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let page: number
                if (totalPages <= 5) {
                  page = i + 1
                } else if (currentPage <= 3) {
                  page = i + 1
                } else if (currentPage >= totalPages - 2) {
                  page = totalPages - 4 + i
                } else {
                  page = currentPage - 2 + i
                }
                return (
                  <button
                    key={page}
                    onClick={() => goToPage(page)}
                    className={`w-8 h-8 rounded-md text-[12px] font-semibold transition-all ${
                      page === currentPage
                        ? 'bg-white/[0.08] text-bright border border-white/[0.1]'
                        : 'text-sub hover:bg-white/[0.04]'
                    }`}
                  >
                    {page}
                  </button>
                )
              })}
              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="px-2.5 py-1.5 rounded-md text-[12px] text-sub border border-white/[0.06] hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                다음
              </button>
            </div>
          </div>
        )}
      </div>

      {editItem && (
        <DividendEditPanel dividend={editItem} onClose={() => setEditItem(null)} />
      )}
      {deleteItem && (
        <DividendDeleteModal dividend={deleteItem} onClose={() => setDeleteItem(null)} />
      )}
    </>
  )
}
