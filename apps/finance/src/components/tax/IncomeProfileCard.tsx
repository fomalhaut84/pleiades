'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatKRW } from '@/lib/format'
import IncomeProfileForm from './IncomeProfileForm'

interface IncomeProfileData {
  id: string
  year: number
  inputType: string
  grossSalary: number | null
  earnedDeduction: number | null
  taxableIncome: number
  prepaidTax: number
  note: string | null
}

interface IncomeProfileCardProps {
  profiles: IncomeProfileData[]
}

export default function IncomeProfileCard({ profiles }: IncomeProfileCardProps) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/income-profiles/${id}`, { method: 'DELETE' })
      if (!res.ok) return
      setDeletingId(null)
      router.refresh()
    } catch {
      // ignore
    }
  }

  if (profiles.length === 0 && !showForm) {
    return (
      <div className="relative overflow-hidden rounded-[14px] border border-border bg-card">
        <div className="p-6 text-center">
          <div className="text-[13px] text-sub mb-3">
            근로소득 프로필이 없습니다
          </div>
          <p className="text-[11px] text-dim mb-4">
            연봉 정보를 등록하면 RSU·스톡옵션 행사 시 정확한 누진세율을 적용할 수 있습니다.
          </p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="px-4 py-2 text-[12px] font-semibold text-bright bg-white/[0.07] rounded-lg border border-white/[0.12] hover:bg-white/[0.10] transition-colors"
          >
            프로필 등록
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 기존 프로필 목록 */}
      {profiles.map((p) => (
        <div key={p.id} className="relative overflow-hidden rounded-[14px] border border-border bg-card">
          {editingId === p.id ? (
            <div className="px-5 py-4">
              <IncomeProfileForm
                initial={p}
                onCancel={() => setEditingId(null)}
              />
            </div>
          ) : (
            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[13px] font-bold text-bright">
                  {p.year}년 근로소득
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditingId(p.id)}
                    className="px-2 py-1 text-[10px] font-semibold text-sub rounded border border-white/[0.06] hover:bg-white/[0.04] transition-colors"
                  >
                    수정
                  </button>
                  {deletingId === p.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleDelete(p.id)}
                        className="px-2 py-1 text-[10px] font-semibold text-red-400 rounded border border-red-500/20 hover:bg-red-500/10 transition-colors"
                      >
                        확인
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingId(null)}
                        className="px-2 py-1 text-[10px] font-semibold text-sub rounded border border-white/[0.06] hover:bg-white/[0.04] transition-colors"
                      >
                        취소
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDeletingId(p.id)}
                      className="px-2 py-1 text-[10px] font-semibold text-sub rounded border border-white/[0.06] hover:bg-white/[0.04] transition-colors"
                    >
                      삭제
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {p.inputType === 'gross' && p.grossSalary != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-sub">세전 총급여</span>
                    <span className="text-[12px] text-muted tabular-nums">
                      {formatKRW(p.grossSalary)}
                    </span>
                  </div>
                )}
                {p.inputType === 'gross' && p.earnedDeduction != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-sub">근로소득공제</span>
                    <span className="text-[12px] text-dim tabular-nums">
                      -{formatKRW(p.earnedDeduction)}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-sub">과세표준</span>
                  <span className="text-[13px] font-bold text-bright tabular-nums">
                    {formatKRW(p.taxableIncome)}
                  </span>
                </div>
                {p.prepaidTax > 0 && (
                  <>
                    <div className="h-px bg-white/[0.04]" />
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-sub">기납부 세액</span>
                      <span className="text-[12px] text-muted tabular-nums">
                        {formatKRW(p.prepaidTax)}
                      </span>
                    </div>
                  </>
                )}
                {p.note && (
                  <div className="text-[11px] text-dim mt-1">{p.note}</div>
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      {/* 새 프로필 추가 폼 or 버튼 */}
      {showForm ? (
        <div className="relative overflow-hidden rounded-[14px] border border-border bg-card px-5 py-4">
          <div className="text-[13px] font-bold text-bright mb-3">새 프로필 등록</div>
          <IncomeProfileForm onCancel={() => setShowForm(false)} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="self-start px-4 py-2 text-[12px] font-semibold text-sub rounded-lg border border-white/[0.06] hover:bg-white/[0.04] hover:text-muted transition-colors"
        >
          + 연도 추가
        </button>
      )}
    </div>
  )
}
