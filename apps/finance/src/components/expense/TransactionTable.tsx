'use client'

import { formatKRW, formatDate } from '@/lib/format'

interface TransactionRow {
  id: string
  amount: number
  description: string
  categoryName: string
  categoryIcon: string | null
  categoryType: 'expense' | 'income'
  transactedAt: string
}

interface TransactionTableProps {
  transactions: TransactionRow[]
  total: number
  limit: number
  offset: number
  onPageChange: (offset: number) => void
}

export default function TransactionTable({
  transactions,
  total,
  limit,
  offset,
  onPageChange,
}: TransactionTableProps) {
  const totalPages = Math.ceil(total / limit)
  const currentPage = Math.floor(offset / limit) + 1

  return (
    <div className="rounded-[14px] border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="text-[13px] font-bold text-bright">
          최근 거래 내역
        </div>
        <div className="text-[11px] text-sub">
          총 {total}건
        </div>
      </div>

      {transactions.length === 0 ? (
        <div className="px-5 py-10 text-center text-[13px] text-sub">
          거래 내역이 없습니다.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border bg-surface-dim">
                  <th className="px-4 py-2.5 text-left text-dim font-semibold tracking-wide uppercase">날짜</th>
                  <th className="px-4 py-2.5 text-left text-dim font-semibold tracking-wide uppercase">카테고리</th>
                  <th className="px-4 py-2.5 text-left text-dim font-semibold tracking-wide uppercase">내용</th>
                  <th className="px-4 py-2.5 text-right text-dim font-semibold tracking-wide uppercase">금액</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const isExpense = tx.categoryType === 'expense'
                  return (
                    <tr key={tx.id} className="border-b border-border last:border-0 hover:bg-surface-dim transition-colors">
                      <td className="px-4 py-3 text-sub tabular-nums whitespace-nowrap">
                        {formatDate(tx.transactedAt)}
                      </td>
                      <td className="px-4 py-3 text-muted whitespace-nowrap">
                        {tx.categoryIcon ? `${tx.categoryIcon} ` : ''}{tx.categoryName}
                      </td>
                      <td className="px-4 py-3 text-bright">
                        {tx.description}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold tabular-nums whitespace-nowrap ${isExpense ? 'text-red-400' : 'text-emerald-400'}`}>
                        {isExpense ? '-' : '+'}{formatKRW(tx.amount)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-border flex items-center justify-between">
              <button
                onClick={() => onPageChange(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className="px-3 py-1.5 text-[12px] font-semibold rounded-md transition-all border border-border disabled:opacity-30 disabled:cursor-not-allowed text-sub hover:bg-surface-dim"
              >
                ← 이전
              </button>
              <span className="text-[11px] text-sub">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => onPageChange(offset + limit)}
                disabled={offset + limit >= total}
                className="px-3 py-1.5 text-[12px] font-semibold rounded-md transition-all border border-border disabled:opacity-30 disabled:cursor-not-allowed text-sub hover:bg-surface-dim"
              >
                다음 →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
