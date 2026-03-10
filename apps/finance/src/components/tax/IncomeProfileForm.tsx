'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { formatKRW } from '@/lib/format'

interface IncomeProfileFormProps {
  /** 수정 모드 시 기존 데이터 */
  initial?: {
    id: string
    year: number
    inputType: string
    grossSalary: number | null
    taxableIncome: number
    prepaidTax: number
    note: string | null
  }
  onCancel?: () => void
}

/** 근로소득공제 간이 계산 (클라이언트 미리보기용) */
function calcDeductionPreview(gross: number): number {
  if (gross <= 0) return 0
  if (gross <= 5_000_000) return Math.round(gross * 0.70)
  if (gross <= 15_000_000) return Math.round(3_500_000 + (gross - 5_000_000) * 0.40)
  if (gross <= 45_000_000) return Math.round(7_500_000 + (gross - 15_000_000) * 0.15)
  if (gross <= 100_000_000) return Math.round(12_000_000 + (gross - 45_000_000) * 0.05)
  return Math.round(14_750_000 + (gross - 100_000_000) * 0.02)
}

const inputClasses = 'w-full bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2.5 text-[13px] text-bright tabular-nums outline-none focus:border-white/[0.12] transition-colors'

export default function IncomeProfileForm({ initial, onCancel }: IncomeProfileFormProps) {
  const router = useRouter()
  const isEdit = !!initial

  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(String(initial?.year ?? currentYear))
  const [inputType, setInputType] = useState<'gross' | 'taxable'>(
    (initial?.inputType as 'gross' | 'taxable') ?? 'gross',
  )
  const [grossSalary, setGrossSalary] = useState(
    initial?.grossSalary != null ? String(initial.grossSalary) : '',
  )
  const [taxableIncome, setTaxableIncome] = useState(
    initial?.inputType === 'taxable' ? String(initial.taxableIncome) : '',
  )
  const [prepaidTax, setPrepaidTax] = useState(
    initial?.prepaidTax ? String(initial.prepaidTax) : '',
  )
  const [note, setNote] = useState(initial?.note ?? '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const deductionPreview = useMemo(() => {
    if (inputType !== 'gross') return null
    const gross = Number(grossSalary) || 0
    if (gross <= 0) return null
    const deduction = calcDeductionPreview(gross)
    return {
      deduction,
      taxable: Math.max(0, gross - deduction),
    }
  }, [inputType, grossSalary])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const payload: Record<string, unknown> = {
        year: Number(year),
        inputType,
        prepaidTax: Number(prepaidTax) || 0,
        note: note.trim() || undefined,
      }

      if (inputType === 'gross') {
        if (!grossSalary.trim()) {
          setError('세전 총급여를 입력해주세요.')
          return
        }
        payload.grossSalary = Number(grossSalary)
      } else {
        if (!taxableIncome.trim()) {
          setError('과세표준을 입력해주세요.')
          return
        }
        payload.taxableIncome = Number(taxableIncome)
      }

      const url = isEdit
        ? `/api/income-profiles/${initial!.id}`
        : '/api/income-profiles'
      const method = isEdit ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? '저장에 실패했습니다.')
        return
      }

      onCancel?.()
      router.refresh()
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          <span className="text-[12px] text-red-400">{error}</span>
        </div>
      )}

      {/* 연도 */}
      <div>
        <label className="text-[12px] text-sub mb-1.5 block">귀속 연도</label>
        <input
          type="number"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          min={2020}
          max={new Date().getFullYear() + 1}
          className={inputClasses}
          disabled={isSubmitting}
        />
      </div>

      {/* 입력 유형 선택 */}
      <div>
        <label className="text-[12px] text-sub mb-1.5 block">입력 방식</label>
        <div className="flex gap-2">
          {(['gross', 'taxable'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setInputType(type)}
              disabled={isSubmitting}
              className={`flex-1 px-3 py-2 text-[12px] font-semibold rounded-lg border transition-colors ${
                inputType === type
                  ? 'bg-white/[0.07] border-white/[0.12] text-bright'
                  : 'bg-white/[0.02] border-white/[0.04] text-dim hover:text-sub'
              }`}
            >
              {type === 'gross' ? '세전 총급여' : '과세표준 직접 입력'}
            </button>
          ))}
        </div>
      </div>

      {/* 금액 입력 */}
      {inputType === 'gross' ? (
        <div>
          <label className="text-[12px] text-sub mb-1.5 block">세전 총급여 (원)</label>
          <input
            type="number"
            value={grossSalary}
            onChange={(e) => setGrossSalary(e.target.value)}
            placeholder="예: 80000000"
            min={0}
            step={1000000}
            className={inputClasses}
            disabled={isSubmitting}
          />
          {deductionPreview && (
            <div className="mt-2 bg-white/[0.02] rounded-lg px-3 py-2 flex flex-col gap-1">
              <div className="flex justify-between">
                <span className="text-[11px] text-dim">근로소득공제</span>
                <span className="text-[11px] text-muted tabular-nums">
                  {formatKRW(deductionPreview.deduction)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[11px] text-dim">과세표준 (예상)</span>
                <span className="text-[11px] text-bright tabular-nums font-semibold">
                  {formatKRW(deductionPreview.taxable)}
                </span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>
          <label className="text-[12px] text-sub mb-1.5 block">종합소득 과세표준 (원)</label>
          <input
            type="number"
            value={taxableIncome}
            onChange={(e) => setTaxableIncome(e.target.value)}
            placeholder="예: 65000000"
            min={0}
            step={1000000}
            className={inputClasses}
            disabled={isSubmitting}
          />
          <p className="mt-1 text-[10px] text-dim">
            근로소득원천징수영수증의 과세표준을 직접 입력합니다.
          </p>
        </div>
      )}

      {/* 기납부 세액 */}
      <div>
        <label className="text-[12px] text-sub mb-1.5 block">기납부 세액 (원)</label>
        <input
          type="number"
          value={prepaidTax}
          onChange={(e) => setPrepaidTax(e.target.value)}
          placeholder="원천징수 합계 (선택)"
          min={0}
          step={100000}
          className={inputClasses}
          disabled={isSubmitting}
        />
        <p className="mt-1 text-[10px] text-dim">
          원천징수영수증의 기납부 세액 합계. 추가 납부/환급 계산에 사용됩니다.
        </p>
      </div>

      {/* 메모 */}
      <div>
        <label className="text-[12px] text-sub mb-1.5 block">메모 (선택)</label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="예: 2025년 원천징수영수증 기준"
          className={inputClasses}
          disabled={isSubmitting}
        />
      </div>

      {/* 버튼 */}
      <div className="flex gap-2 justify-end">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-4 py-2 text-[12px] font-semibold text-sub rounded-lg border border-white/[0.06] hover:bg-white/[0.03] transition-colors"
          >
            취소
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 text-[12px] font-semibold text-bright bg-white/[0.07] rounded-lg border border-white/[0.12] hover:bg-white/[0.10] transition-colors disabled:opacity-40"
        >
          {isSubmitting ? '저장 중...' : isEdit ? '수정' : '저장'}
        </button>
      </div>
    </form>
  )
}
