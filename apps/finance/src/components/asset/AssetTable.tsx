'use client'

import { formatKRW, formatDate } from '@/lib/format'

export interface AssetRow {
  id: string
  name: string
  category: string
  owner: string
  value: number
  isLiability: boolean
  interestRate: number | null
  maturityDate: string | null
  note: string | null
}

const CATEGORY_LABELS: Record<string, string> = {
  savings: '적금/예금',
  cash: '입출금',
  insurance: '보험',
  real_estate: '부동산',
  pension: '연금',
  loan: '대출',
  other: '기타',
}

type OwnerTab = '전체' | '세진' | '소담' | '다솜' | '공동'

interface AssetTableProps {
  assets: AssetRow[]
  activeTab: OwnerTab
  onTabChange: (tab: OwnerTab) => void
  onEdit: (asset: AssetRow) => void
  onDelete: (asset: AssetRow) => void
}

export default function AssetTable({ assets, activeTab, onTabChange, onEdit, onDelete }: AssetTableProps) {
  const filtered = activeTab === '전체' ? assets : assets.filter((a) => a.owner === activeTab)
  const assetTotal = filtered.filter((a) => !a.isLiability).reduce((s, a) => s + a.value, 0)
  const liabilityTotal = filtered.filter((a) => a.isLiability).reduce((s, a) => s + a.value, 0)

  const TABS: OwnerTab[] = ['전체', '세진', '소담', '다솜', '공동']

  return (
    <>
      <div className="flex gap-1 mb-4">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={`px-4 py-2 rounded-lg text-[13px] font-semibold border transition-all ${
              activeTab === tab
                ? 'bg-surface text-bright border-border-hover'
                : 'border-transparent text-sub hover:bg-surface-dim'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="relative overflow-hidden rounded-[14px] border border-border bg-card">
        <div className="px-5 py-3.5 border-b border-border flex justify-between items-center">
          <div className="text-[13px] font-bold text-bright">
            {activeTab} 자산
          </div>
          <div className="text-[12px] text-sub">
            {filtered.length}개 · 자산 {formatKRW(assetTotal)} · 부채 {formatKRW(liabilityTotal)}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-sub">
            자산이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border bg-surface-dim">
                  <th className="px-4 py-2.5 text-left text-dim font-semibold">이름</th>
                  <th className="px-4 py-2.5 text-left text-dim font-semibold">카테고리</th>
                  <th className="px-4 py-2.5 text-left text-dim font-semibold">소유자</th>
                  <th className="px-4 py-2.5 text-right text-dim font-semibold">금액</th>
                  <th className="px-4 py-2.5 text-right text-dim font-semibold">이율</th>
                  <th className="px-4 py-2.5 text-left text-dim font-semibold">만기</th>
                  <th className="px-4 py-2.5 text-center text-dim font-semibold">액션</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0 hover:bg-surface-dim transition-colors">
                    <td className="px-4 py-3 text-bright font-medium">
                      {a.name}
                      {a.isLiability && <span className="ml-1.5 text-[10px] font-semibold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">부채</span>}
                    </td>
                    <td className="px-4 py-3 text-muted">{CATEGORY_LABELS[a.category] ?? a.category}</td>
                    <td className="px-4 py-3 text-muted">{a.owner}</td>
                    <td className={`px-4 py-3 text-right font-semibold tabular-nums ${a.isLiability ? 'text-red-400' : 'text-bright'}`}>
                      {a.isLiability ? '-' : ''}{formatKRW(a.value)}
                    </td>
                    <td className="px-4 py-3 text-right text-muted tabular-nums">
                      {a.interestRate != null ? `${a.interestRate}%` : '-'}
                    </td>
                    <td className="px-4 py-3 text-muted tabular-nums">
                      {a.maturityDate ? formatDate(a.maturityDate) : '-'}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <button
                        onClick={() => onEdit(a)}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-md text-dim hover:text-text hover:bg-surface transition-all"
                        title="수정"
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M11.5 2.5l2 2M2 11l-0.5 3.5 3.5-0.5 8.5-8.5-3-3L2 11z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => onDelete(a)}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-md text-dim hover:text-red-400 hover:bg-red-500/10 transition-all"
                        title="삭제"
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
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
    </>
  )
}
