'use client'

import { useState, useMemo } from 'react'
import Card from '@/components/ui/Card'
import type { ValidatedRow, ImportRequest, ImportResult } from '@/types/csv-import'

interface StepValidationProps {
  validatedRows: ValidatedRow[]
  accountId: string
  market: 'US' | 'KR'
  currency: 'USD' | 'KRW'
  onNext: (result: ImportResult) => void
  onBack: () => void
}

type StatusFilter = 'all' | 'valid' | 'duplicate' | 'error'

export default function StepValidation({
  validatedRows,
  accountId,
  market,
  currency,
  onNext,
  onBack,
}: StepValidationProps) {
  const [skipDuplicates, setSkipDuplicates] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [filter, setFilter] = useState<StatusFilter>('all')

  const counts = useMemo(() => {
    const c = { valid: 0, duplicate: 0, error: 0 }
    for (const row of validatedRows) {
      c[row.status]++
    }
    return c
  }, [validatedRows])

  const filteredRows = useMemo(
    () =>
      filter === 'all'
        ? validatedRows
        : validatedRows.filter((r) => r.status === filter),
    [validatedRows, filter]
  )

  const canImport = counts.valid > 0 || (!skipDuplicates && counts.duplicate > 0)

  const handleImport = async () => {
    setIsSubmitting(true)
    setSubmitError(null)

    const tradesToImport = validatedRows
      .filter((r) => {
        if (r.status === 'error') return false
        if (r.status === 'duplicate' && skipDuplicates) return false
        return true
      })
      .map((r) => ({
        ticker: r.data.ticker,
        displayName: r.data.displayName,
        type: r.data.type as 'BUY' | 'SELL',
        shares: r.data.shares,
        price: r.data.price,
        fxRate: r.data.fxRate,
        tradedAt: r.data.tradedAt,
        note: r.data.note || undefined,
      }))

    const payload: ImportRequest = {
      accountId,
      market,
      currency,
      skipDuplicates,
      trades: tradesToImport,
    }

    try {
      const res = await fetch('/api/trades/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) {
        setSubmitError(data.error ?? '임포트에 실패했습니다.')
        return
      }

      onNext(data.result as ImportResult)
    } catch {
      setSubmitError('네트워크 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const statusLabel: Record<ValidatedRow['status'], { text: string; color: string }> = {
    valid: { text: '유효', color: 'text-sejin bg-sejin/10' },
    duplicate: { text: '중복', color: 'text-amber-400 bg-amber-400/10' },
    error: { text: '오류', color: 'text-red-400 bg-red-400/10' },
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 요약 바 */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="text-center !py-3">
          <div className="text-[20px] font-bold text-sejin tabular-nums">{counts.valid}</div>
          <div className="text-[11px] text-dim mt-0.5">유효</div>
        </Card>
        <Card className="text-center !py-3">
          <div className="text-[20px] font-bold text-amber-400 tabular-nums">{counts.duplicate}</div>
          <div className="text-[11px] text-dim mt-0.5">중복</div>
        </Card>
        <Card className="text-center !py-3">
          <div className="text-[20px] font-bold text-red-400 tabular-nums">{counts.error}</div>
          <div className="text-[11px] text-dim mt-0.5">오류</div>
        </Card>
      </div>

      {/* 옵션 */}
      {counts.duplicate > 0 && (
        <Card className="!py-3">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={skipDuplicates}
              onChange={(e) => setSkipDuplicates(e.target.checked)}
              className="rounded border-border-hover bg-surface text-sodam focus:ring-sodam/30"
            />
            <span className="text-[12px] text-muted">
              중복 거래 건너뛰기 ({counts.duplicate}건)
            </span>
          </label>
        </Card>
      )}

      {/* 필터 탭 */}
      <div className="flex gap-1 bg-card rounded-lg p-1 border border-border">
        {(['all', 'valid', 'duplicate', 'error'] as StatusFilter[]).map((f) => {
          const count = f === 'all' ? validatedRows.length : counts[f]
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`flex-1 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                filter === f
                  ? 'bg-surface text-bright'
                  : 'text-dim hover:text-sub'
              }`}
            >
              {f === 'all' ? '전체' : statusLabel[f].text} ({count})
            </button>
          )
        })}
      </div>

      {/* 테이블 */}
      <Card className="!p-0">
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-card z-10">
              <tr>
                <th className="text-left text-dim font-medium px-3 py-2">#</th>
                <th className="text-left text-dim font-medium px-2 py-2">상태</th>
                <th className="text-left text-dim font-medium px-2 py-2">티커</th>
                <th className="text-left text-dim font-medium px-2 py-2">유형</th>
                <th className="text-right text-dim font-medium px-2 py-2">수량</th>
                <th className="text-right text-dim font-medium px-2 py-2">단가</th>
                <th className="text-left text-dim font-medium px-2 py-2">거래일</th>
                <th className="text-left text-dim font-medium px-2 py-2">비고</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const s = statusLabel[row.status]
                return (
                  <tr
                    key={row.rowIndex}
                    className="border-t border-border hover:bg-card"
                  >
                    <td className="text-dim px-3 py-2">{row.rowIndex + 1}</td>
                    <td className="px-2 py-2">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${s.color}`}>
                        {s.text}
                      </span>
                    </td>
                    <td className="text-muted px-2 py-2 font-mono">{row.data.ticker}</td>
                    <td className={`px-2 py-2 font-semibold ${
                      row.data.type === 'BUY' ? 'text-sejin' : row.data.type === 'SELL' ? 'text-red-400' : 'text-amber-400'
                    }`}>
                      {row.data.type === 'BUY' ? '매수' : row.data.type === 'SELL' ? '매도' : '?'}
                    </td>
                    <td className="text-muted px-2 py-2 text-right tabular-nums">
                      {row.data.shares.toLocaleString()}
                    </td>
                    <td className="text-muted px-2 py-2 text-right tabular-nums">
                      {currency === 'USD'
                        ? `$${row.data.price.toFixed(2)}`
                        : `${Math.round(row.data.price).toLocaleString('ko-KR')}`}
                    </td>
                    <td className="text-muted px-2 py-2">{row.data.tradedAt || '-'}</td>
                    <td className="px-2 py-2">
                      {row.status === 'error' ? (
                        <span className="text-red-400">
                          {row.errors.map((e) => e.message).join(', ')}
                        </span>
                      ) : (
                        <span className="text-dim truncate max-w-[120px] inline-block">
                          {row.data.note || '-'}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 에러 */}
      {submitError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 text-[12px] text-red-400">
          {submitError}
        </div>
      )}

      {/* 버튼 */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 py-3 rounded-lg text-[13px] font-semibold text-sub border border-border hover:bg-surface-dim transition-all"
        >
          ← 이전
        </button>
        <button
          type="button"
          disabled={!canImport || isSubmitting}
          onClick={handleImport}
          className="flex-[2] py-3 rounded-lg text-[14px] font-bold transition-all disabled:opacity-30 bg-sejin/20 text-sejin hover:bg-sejin/30 border border-sejin/25"
        >
          {isSubmitting
            ? '임포트 중...'
            : `${counts.valid + (skipDuplicates ? 0 : counts.duplicate)}건 임포트`}
        </button>
      </div>
    </div>
  )
}
