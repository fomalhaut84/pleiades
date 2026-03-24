'use client'

import { formatKRW, formatDate } from '@/lib/format'

export interface TransactionRow {
  id: string
  amount: number
  description: string
  categoryId: string
  categoryName: string
  categoryIcon: string | null
  categoryType: 'expense' | 'income'
  type?: string | null
  linkedAssetId?: string | null
  linkedAssetName?: string | null
  transactedAt: string
}

interface TransactionTableProps {
  transactions: TransactionRow[]
  total: number
  limit: number
  offset: number
  onPageChange: (offset: number) => void
  onEdit?: (tx: TransactionRow) => void
  onDelete?: (tx: TransactionRow) => void
  onRegisterRecurring?: (tx: TransactionRow) => void
}

export default function TransactionTable({
  transactions,
  total,
  limit,
  offset,
  onPageChange,
  onEdit,
  onDelete,
  onRegisterRecurring,
}: TransactionTableProps) {
  const totalPages = Math.ceil(total / limit)
  const currentPage = Math.floor(offset / limit) + 1
  const hasActions = onEdit || onDelete || onRegisterRecurring

  return (
    <div className="rounded-[14px] border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="text-[13px] font-bold text-bright">
          최근 가계부 내역
        </div>
        <div className="text-[11px] text-sub">
          총 {total}건
        </div>
      </div>

      {transactions.length === 0 ? (
        <div className="px-5 py-10 text-center text-[13px] text-sub">
          내역이 없습니다.
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
                  {hasActions && (
                    <th className="px-4 py-2.5 text-center text-dim font-semibold tracking-wide uppercase">액션</th>
                  )}
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
                        {tx.type === 'transfer_out' && tx.linkedAssetName && (
                          <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-semibold text-sodam bg-sodam/15 px-2 py-0.5 rounded">
                            출금 → {tx.linkedAssetName}
                          </span>
                        )}
                        {tx.type === 'transfer_in' && tx.linkedAssetName && (
                          <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-semibold text-teal-400 bg-teal-500/12 px-2 py-0.5 rounded">
                            입금 → {tx.linkedAssetName}
                          </span>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold tabular-nums whitespace-nowrap ${isExpense ? 'text-red-400' : 'text-emerald-400'}`}>
                        {isExpense ? '-' : '+'}{formatKRW(tx.amount)}
                      </td>
                      {hasActions && (
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          {onEdit && (
                            <button
                              onClick={() => onEdit(tx)}
                              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-dim hover:text-text hover:bg-surface transition-all"
                              title="수정"
                            >
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M11.5 2.5l2 2M2 11l-0.5 3.5 3.5-0.5 8.5-8.5-3-3L2 11z" />
                              </svg>
                            </button>
                          )}
                          {onDelete && (
                            <button
                              onClick={() => onDelete(tx)}
                              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-dim hover:text-red-400 hover:bg-red-500/10 transition-all"
                              title="삭제"
                            >
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4" />
                              </svg>
                            </button>
                          )}
                          {onRegisterRecurring && tx.type !== 'transfer_out' && tx.type !== 'transfer_in' && (
                            <button
                              onClick={() => onRegisterRecurring(tx)}
                              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-dim hover:text-sodam hover:bg-sodam/10 transition-all"
                              title="반복 등록"
                            >
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M13.5 8A5.5 5.5 0 113 5.5M3 2v3.5H6.5" />
                              </svg>
                            </button>
                          )}
                        </td>
                      )}
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
                &larr; 이전
              </button>
              <span className="text-[11px] text-sub">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => onPageChange(offset + limit)}
                disabled={offset + limit >= total}
                className="px-3 py-1.5 text-[12px] font-semibold rounded-md transition-all border border-border disabled:opacity-30 disabled:cursor-not-allowed text-sub hover:bg-surface-dim"
              >
                다음 &rarr;
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
