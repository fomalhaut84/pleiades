'use client'

import { useState, useMemo } from 'react'
import Card from '@/components/ui/Card'
import { autoDetectMapping, applyMapping, validateRows } from '@/lib/csv-import'
import type {
  TradeField,
  ColumnMapping,
  ValidatedRow,
} from '@/types/csv-import'
import {
  TRADE_FIELD_LABELS as LABELS,
  REQUIRED_FIELDS as REQUIRED,
} from '@/types/csv-import'

interface StepMappingProps {
  headers: string[]
  rows: Record<string, string>[]
  currency: 'USD' | 'KRW'
  existingTrades: Array<{
    ticker: string
    type: string
    tradedAt: string
    shares: number
    price: number
  }>
  onNext: (validatedRows: ValidatedRow[]) => void
  onBack: () => void
}

const ALL_FIELDS: TradeField[] = [
  'ticker',
  'displayName',
  'type',
  'shares',
  'price',
  'fxRate',
  'tradedAt',
  'note',
]

export default function StepMapping({
  headers,
  rows,
  currency,
  existingTrades,
  onNext,
  onBack,
}: StepMappingProps) {
  const [mapping, setMapping] = useState<ColumnMapping>(() =>
    autoDetectMapping(headers)
  )

  const handleChange = (header: string, value: string) => {
    const newMapping = { ...mapping }

    // 같은 필드가 이미 매핑된 다른 헤더가 있으면 해제
    if (value) {
      for (const [h, f] of Object.entries(newMapping)) {
        if (h !== header && f === value) {
          newMapping[h] = null
        }
      }
    }

    newMapping[header] = (value || null) as TradeField | null
    setMapping(newMapping)
  }

  const mappedFields = useMemo(
    () => new Set(Object.values(mapping).filter(Boolean)),
    [mapping]
  )

  const missingRequired = REQUIRED.filter((f) => {
    if (f === 'fxRate' && currency === 'KRW') return false
    return !mappedFields.has(f)
  })

  // displayName은 필수 아님 — ticker로 대체 가능
  const canProceed = missingRequired.length === 0

  const handleNext = () => {
    const mappedRows = rows.map((row) => applyMapping(row, mapping, currency))
    const validated = validateRows(mappedRows, existingTrades, currency)
    onNext(validated)
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <label className="block text-[12px] font-semibold text-sub mb-3">
          컬럼 매핑
        </label>
        <p className="text-[11px] text-dim mb-4">
          CSV 컬럼을 거래 필드에 매핑하세요. 자동 감지된 매핑을 수정할 수 있습니다.
        </p>

        <div className="flex flex-col gap-2">
          {headers.map((header) => (
            <div
              key={header}
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-3"
            >
              <div className="text-[12px] text-muted truncate bg-surface-dim rounded px-3 py-2 border border-border">
                {header}
              </div>
              <span className="text-[11px] text-dim">→</span>
              <select
                value={mapping[header] ?? ''}
                onChange={(e) => handleChange(header, e.target.value)}
                className="w-full bg-surface-dim border border-border rounded-lg px-3 py-2 text-[12px] text-bright focus:outline-none focus:border-border-hover transition-colors"
              >
                <option value="">무시</option>
                {ALL_FIELDS.map((field) => {
                  const isUsed = mappedFields.has(field) && mapping[header] !== field
                  if (currency === 'KRW' && field === 'fxRate') return null
                  return (
                    <option key={field} value={field} disabled={isUsed}>
                      {LABELS[field]}
                      {REQUIRED.includes(field) ? ' *' : ''}
                    </option>
                  )
                })}
              </select>
            </div>
          ))}
        </div>

        {missingRequired.length > 0 && (
          <div className="mt-4 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
            <p className="text-[11px] text-amber-400">
              필수 필드 미매핑: {missingRequired.map((f) => LABELS[f]).join(', ')}
            </p>
          </div>
        )}
      </Card>

      {/* 매핑 미리보기 */}
      <Card>
        <label className="block text-[12px] font-semibold text-sub mb-2">
          매핑 결과 미리보기 (처음 5행)
        </label>
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-[11px]">
            <thead>
              <tr>
                <th className="text-left text-dim font-medium px-2 py-1.5">#</th>
                {ALL_FIELDS
                  .filter((f) => currency === 'USD' || f !== 'fxRate')
                  .filter((f) => mappedFields.has(f))
                  .map((f) => (
                    <th key={f} className="text-left text-dim font-medium px-2 py-1.5 whitespace-nowrap">
                      {LABELS[f]}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 5).map((row, i) => {
                const mapped = applyMapping(row, mapping, currency)
                return (
                  <tr key={i} className="border-t border-border">
                    <td className="text-dim px-2 py-1.5">{i + 1}</td>
                    {ALL_FIELDS
                      .filter((f) => currency === 'USD' || f !== 'fxRate')
                      .filter((f) => mappedFields.has(f))
                      .map((f) => (
                        <td key={f} className="text-muted px-2 py-1.5 whitespace-nowrap max-w-[150px] truncate">
                          {String(mapped[f as keyof typeof mapped] ?? '-')}
                        </td>
                      ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

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
          disabled={!canProceed}
          onClick={handleNext}
          className="flex-[2] py-3 rounded-lg text-[14px] font-bold transition-all disabled:opacity-30 bg-sodam/20 text-sodam hover:bg-sodam/30 border border-sodam/25"
        >
          검증 미리보기 →
        </button>
      </div>
    </div>
  )
}
