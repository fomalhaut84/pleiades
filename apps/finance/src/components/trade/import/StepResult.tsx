'use client'

import Link from 'next/link'
import Card from '@/components/ui/Card'
import type { ImportResult } from '@/types/csv-import'

interface StepResultProps {
  result: ImportResult
}

export default function StepResult({ result }: StepResultProps) {
  const hasErrors = result.errors.length > 0

  return (
    <div className="flex flex-col gap-5">
      {/* 결과 요약 */}
      <Card>
        <div className="text-center py-4">
          <div className="text-[36px] mb-2">
            {result.failed === 0 ? '\u2714' : '\u26A0'}
          </div>
          <h2 className="text-[16px] font-bold text-bright">
            {result.created > 0
              ? '임포트 완료'
              : result.skipped > 0 && result.failed === 0
              ? '모두 중복으로 스킵'
              : '임포트 실패'}
          </h2>
          <p className="text-[12px] text-sub mt-1">
            총 {result.total}건 중 {result.created}건 생성
            {result.skipped > 0 && `, ${result.skipped}건 스킵`}
          </p>
        </div>
      </Card>

      {/* 상세 카운트 */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="text-center !py-3">
          <div className="text-[20px] font-bold text-sejin tabular-nums">
            {result.created}
          </div>
          <div className="text-[11px] text-dim mt-0.5">생성</div>
        </Card>
        <Card className="text-center !py-3">
          <div className="text-[20px] font-bold text-amber-400 tabular-nums">
            {result.skipped}
          </div>
          <div className="text-[11px] text-dim mt-0.5">스킵</div>
        </Card>
        <Card className="text-center !py-3">
          <div className="text-[20px] font-bold text-red-400 tabular-nums">
            {result.failed}
          </div>
          <div className="text-[11px] text-dim mt-0.5">실패</div>
        </Card>
      </div>

      {/* 에러 상세 */}
      {hasErrors && (
        <Card>
          <label className="block text-[12px] font-semibold text-sub mb-2">
            오류 상세
          </label>
          <div className="max-h-[200px] overflow-y-auto flex flex-col gap-1">
            {result.errors.slice(0, 20).map((err, i) => (
              <div
                key={i}
                className="text-[11px] text-red-400 bg-red-500/5 rounded px-2.5 py-1.5"
              >
                행 {err.row}: [{err.field}] {err.message}
              </div>
            ))}
            {result.errors.length > 20 && (
              <p className="text-[11px] text-dim mt-1">
                ... 외 {result.errors.length - 20}건
              </p>
            )}
          </div>
        </Card>
      )}

      {/* 네비게이션 */}
      <div className="flex gap-3">
        <Link
          href="/trades"
          className="flex-1 py-3 rounded-lg text-[13px] font-semibold text-center text-sodam bg-sodam/15 border border-sodam/25 hover:bg-sodam/25 transition-all"
        >
          거래 내역 보기
        </Link>
        <Link
          href="/"
          className="flex-1 py-3 rounded-lg text-[13px] font-semibold text-center text-sub border border-white/[0.06] hover:bg-white/[0.03] transition-all"
        >
          대시보드
        </Link>
      </div>
    </div>
  )
}
