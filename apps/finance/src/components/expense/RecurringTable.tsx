'use client'

import { formatKRW, formatDate } from '@/lib/format'
import { formatFrequency } from '@/lib/recurring-utils'

export interface RecurringRow {
  id: string
  amount: number
  description: string
  categoryId: string
  categoryName: string
  categoryIcon: string | null
  categoryType: string
  frequency: string
  dayOfMonth: number | null
  dayOfWeek: number | null
  monthOfYear: number | null
  isActive: boolean
  nextRunAt: string
  lastRunAt: string | null
}

interface RecurringTableProps {
  items: RecurringRow[]
  onEdit: (item: RecurringRow) => void
  onDelete: (item: RecurringRow) => void
  onToggle: (id: string, isActive: boolean) => void
}

export default function RecurringTable({ items, onEdit, onDelete, onToggle }: RecurringTableProps) {
  return (
    <div className="rounded-[14px] border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <span className="text-[13px] font-bold text-bright">반복 거래 목록</span>
        <span className="text-[11px] text-sub">
          {items.length}건 (활성 {items.filter((i) => i.isActive).length})
        </span>
      </div>

      {items.length === 0 ? (
        <div className="px-5 py-10 text-center text-[13px] text-sub">
          반복 거래가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border bg-surface-dim">
                <th className="px-4 py-2.5 text-center text-dim font-semibold tracking-wide uppercase w-[50px]">활성</th>
                <th className="px-4 py-2.5 text-left text-dim font-semibold tracking-wide uppercase">카테고리</th>
                <th className="px-4 py-2.5 text-left text-dim font-semibold tracking-wide uppercase">내용</th>
                <th className="px-4 py-2.5 text-right text-dim font-semibold tracking-wide uppercase">금액</th>
                <th className="px-4 py-2.5 text-left text-dim font-semibold tracking-wide uppercase">주기</th>
                <th className="px-4 py-2.5 text-left text-dim font-semibold tracking-wide uppercase">다음 실행</th>
                <th className="px-4 py-2.5 text-center text-dim font-semibold tracking-wide uppercase w-[70px]">액션</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className={`border-b border-border last:border-0 hover:bg-surface-dim transition-colors ${!item.isActive ? 'opacity-50' : ''}`}
                >
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => onToggle(item.id, !item.isActive)}
                      className="inline-block"
                      title={item.isActive ? '비활성화' : '활성화'}
                    >
                      <span
                        className={`inline-block w-2.5 h-2.5 rounded-full transition-all ${
                          item.isActive ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]' : 'bg-dim'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-bright font-medium whitespace-nowrap">
                    {item.categoryIcon ? `${item.categoryIcon} ` : ''}{item.categoryName}
                  </td>
                  <td className="px-4 py-3 text-text">{item.description}</td>
                  <td className="px-4 py-3 text-right text-red-400 font-semibold tabular-nums whitespace-nowrap">
                    {formatKRW(item.amount)}
                  </td>
                  <td className="px-4 py-3 text-sub whitespace-nowrap">
                    {formatFrequency(item.frequency, item.dayOfMonth, item.dayOfWeek, item.monthOfYear)}
                  </td>
                  <td className="px-4 py-3 text-sub tabular-nums whitespace-nowrap">
                    {formatDate(item.nextRunAt)}
                  </td>
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    <button
                      onClick={() => onEdit(item)}
                      className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-md text-dim hover:text-text hover:bg-surface transition-all"
                      title="수정"
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M11.5 2.5l2 2M2 11l-0.5 3.5 3.5-0.5 8.5-8.5-3-3L2 11z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => onDelete(item)}
                      className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-md text-dim hover:text-red-400 hover:bg-red-500/10 transition-all"
                      title="삭제"
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
