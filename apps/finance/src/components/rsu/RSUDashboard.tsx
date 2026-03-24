'use client'

import { useState } from 'react'
import Card from '@/components/ui/Card'
import { formatKRW, formatDate } from '@/lib/format'
import RSUForm from './RSUForm'
import RSUDeleteModal from './RSUDeleteModal'

interface RSUSchedule {
  id: string
  accountId: string
  vestingDate: string
  shares: number
  basisValue: number
  basisDate: string | null
  vestPrice: number | null
  status: string
  sellShares: number | null
  keepShares: number | null
  note: string | null
  vestedAt: string | null
  account: { id: string; name: string }
}

interface RSUDashboardProps {
  schedules: RSUSchedule[]
  accounts?: { id: string; name: string }[]
}

export default function RSUDashboard({ schedules: initialSchedules, accounts = [] }: RSUDashboardProps) {
  const [schedules, setSchedules] = useState(initialSchedules)
  const [vestingId, setVestingId] = useState<string | null>(null)
  const [vestPrice, setVestPrice] = useState('')
  const [autoSell, setAutoSell] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // CRUD 상태
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState<RSUSchedule | null>(null)
  const [deletingItem, setDeletingItem] = useState<RSUSchedule | null>(null)

  const refreshSchedules = async () => {
    try {
      const res = await fetch('/api/rsu')
      if (res.ok) {
        const data = await res.json()
        setSchedules(data.schedules ?? [])
      }
    } catch {}
  }

  const handleVest = async (id: string) => {
    const price = parseFloat(vestPrice)
    if (!Number.isFinite(price) || price <= 0) {
      setError('유효한 종가를 입력해주세요.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/rsu/${id}/vest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vestPrice: price, autoSell }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? '베스팅 처리에 실패했습니다.')
        return
      }

      const { schedule: updated } = await res.json()

      setSchedules((prev) =>
        prev.map((s) =>
          s.id === id
            ? { ...s, status: updated.status, vestPrice: updated.vestPrice, vestedAt: updated.vestedAt }
            : s
        )
      )
      setVestingId(null)
      setVestPrice('')
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const statusBadge = (status: string) => {
    if (status === 'vested') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-500/15 text-green-400 border border-green-500/20">
          베스팅 완료
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">
        대기중
      </span>
    )
  }

  return (
    <div className="space-y-4">
      {/* 추가 버튼 */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg bg-sodam/15 text-sodam text-[12px] sm:text-[13px] font-semibold border border-sodam/25 hover:bg-sodam/25 transition-all"
        >
          + RSU 추가
        </button>
      </div>

      {schedules.map((schedule) => (
        <Card key={schedule.id}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                {statusBadge(schedule.status)}
                <span className="text-[13px] text-sub">
                  {schedule.account.name} 계좌
                </span>
              </div>

              <div className="text-[15px] font-bold text-bright mb-1">
                카카오 RSU — {schedule.shares}주
              </div>

              <div className="text-[12px] text-sub">
                {schedule.note && (
                  <span className="text-muted">{schedule.note} · </span>
                )}
                베스팅일: {formatDate(schedule.vestingDate)}
              </div>

              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-[12px] text-sub">
                <span>기준금액: {formatKRW(schedule.basisValue)}</span>
                {schedule.sellShares != null && (
                  <span>매도 계획: {schedule.sellShares}주</span>
                )}
                {schedule.keepShares != null && (
                  <span>보유 계획: {schedule.keepShares}주</span>
                )}
              </div>

              {schedule.status === 'vested' && schedule.vestPrice != null && (
                <div className="flex gap-x-5 mt-2 text-[12px] text-green-400">
                  <span>베스팅 종가: {formatKRW(schedule.vestPrice)}</span>
                  {schedule.vestedAt && (
                    <span>처리일: {formatDate(schedule.vestedAt)}</span>
                  )}
                </div>
              )}
            </div>

            <div className="flex-shrink-0 flex items-center gap-1.5">
              {schedule.status === 'pending' && (
                <>
                  {vestingId === schedule.id ? (
                    <button
                      onClick={() => { setVestingId(null); setError(null) }}
                      className="text-[12px] text-sub hover:text-muted"
                    >
                      취소
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => setVestingId(schedule.id)}
                        className="px-3 py-1.5 rounded-lg bg-sejin/15 text-sejin text-[12px] font-semibold border border-sejin/25 hover:bg-sejin/25 transition-all"
                      >
                        베스팅
                      </button>
                      <button
                        onClick={() => setEditingItem(schedule)}
                        className="p-1.5 rounded-md text-dim hover:text-text hover:bg-surface transition-all"
                        title="수정"
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M11.5 2.5l2 2M2 11l-0.5 3.5 3.5-0.5 8.5-8.5-3-3L2 11z" /></svg>
                      </button>
                      <button
                        onClick={() => setDeletingItem(schedule)}
                        className="p-1.5 rounded-md text-dim hover:text-red-400 hover:bg-red-500/10 transition-all"
                        title="삭제"
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4" /></svg>
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* 인라인 베스팅 폼 */}
          {vestingId === schedule.id && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="space-y-3">
                <div>
                  <label className="block text-[12px] text-sub mb-1">
                    베스팅일 종가 (원)
                  </label>
                  <input
                    type="number"
                    value={vestPrice}
                    onChange={(e) => setVestPrice(e.target.value)}
                    placeholder="예: 45000"
                    className="w-full max-w-[240px] px-3 py-2 rounded-lg bg-surface-dim border border-border text-[13px] text-bright placeholder:text-dim focus:outline-none focus:border-sejin/50"
                  />
                </div>

                {schedule.sellShares != null && schedule.sellShares > 0 && (
                  <label className="flex items-center gap-2 text-[13px] text-sub cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoSell}
                      onChange={(e) => setAutoSell(e.target.checked)}
                      className="rounded border-border"
                    />
                    베스팅 직후 {schedule.sellShares}주 매도 처리
                  </label>
                )}

                {vestPrice && parseFloat(vestPrice) > 0 && (
                  <div className="p-3 rounded-lg bg-card border border-border text-[12px] text-sub space-y-1">
                    <div className="text-muted font-medium mb-1">요약</div>
                    <div>취득: {schedule.shares}주 x {formatKRW(parseFloat(vestPrice))} = {formatKRW(schedule.shares * parseFloat(vestPrice))}</div>
                    {autoSell && schedule.sellShares != null && schedule.sellShares > 0 && (
                      <div>매도: {schedule.sellShares}주 x {formatKRW(parseFloat(vestPrice))} = {formatKRW(schedule.sellShares * parseFloat(vestPrice))}</div>
                    )}
                    <div className="text-bright">
                      보유: {autoSell && schedule.sellShares ? schedule.shares - schedule.sellShares : schedule.shares}주
                    </div>
                  </div>
                )}

                {error && (
                  <div className="text-[12px] text-red-400">{error}</div>
                )}

                <button
                  onClick={() => handleVest(schedule.id)}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-sejin/15 text-sejin text-[13px] font-semibold border border-sejin/25 hover:bg-sejin/25 transition-all disabled:opacity-50"
                >
                  {loading ? '처리중...' : '확인'}
                </button>
              </div>
            </div>
          )}
        </Card>
      ))}

      {schedules.length === 0 && (
        <div className="text-center py-12 text-sub text-[13px]">
          등록된 RSU 스케줄이 없습니다.
        </div>
      )}

      <div className="text-[11px] text-dim mt-4 px-1">
        RSU 근로소득세는 회사에서 원천징수됩니다. 이 계산은 참고용이며 법적 조언이 아닙니다.
      </div>

      {/* RSU 추가/수정 폼 */}
      {showForm && (
        <RSUForm mode="create" accounts={accounts} onClose={() => setShowForm(false)} onSaved={refreshSchedules} />
      )}
      {editingItem && (
        <RSUForm
          mode="edit"
          item={{
            id: editingItem.id,
            accountId: editingItem.accountId,
            vestingDate: editingItem.vestingDate,
            shares: editingItem.shares,
            basisValue: editingItem.basisValue,
            basisDate: editingItem.basisDate,
            sellShares: editingItem.sellShares,
            keepShares: editingItem.keepShares,
            note: editingItem.note,
          }}
          accounts={accounts}
          onClose={() => setEditingItem(null)}
          onSaved={refreshSchedules}
        />
      )}
      {deletingItem && (
        <RSUDeleteModal
          item={{ id: deletingItem.id, vestingDate: deletingItem.vestingDate, shares: deletingItem.shares, basisValue: deletingItem.basisValue }}
          onClose={() => setDeletingItem(null)}
          onDeleted={refreshSchedules}
        />
      )}
    </div>
  )
}
