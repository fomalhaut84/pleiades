'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip as RTooltip,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { KIND_META, kindMetaOf, STATUS_META, type AlertKind } from './kinds'
import { formatFiredAt, messageForDisplay, periodFromISO } from './client-utils'
import AlertHistoryDetailModal, {
  type AlertHistoryDetailRow,
} from '@/components/alerts/AlertHistoryDetailModal'

interface HistoryRow {
  id: string
  firedAt: string
  kind: string
  ticker: string | null
  price: number | null
  changePercent: number | null
  message: string
  deliveryStatus: string
  recipientCount: number
  errorMessage: string | null
  /** Phase 37-A (#444): kind 별 스냅샷 (nullable — 이전 row 는 null) */
  context: unknown
}

interface Stats {
  total: number
  byStatus: { sent: number; partial: number; failed: number }
  byKind: Array<{ kind: string; count: number }>
  byDay: Array<{ date: string; count: number }>
}

const PERIOD_OPTIONS = [
  { key: 7, label: '7일' },
  { key: 30, label: '30일' },
  { key: 90, label: '90일' },
] as const

const PAGE_SIZE = 30

export default function AlertHistoryClient() {
  const [days, setDays] = useState<number>(7)
  const [selectedKinds, setSelectedKinds] = useState<Set<AlertKind>>(new Set())
  const [tickerInput, setTickerInput] = useState('')
  const [tickerFilter, setTickerFilter] = useState('')
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<Stats | null>(null)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Phase 37-A (#444): 상세 모달 상태 — id 대신 row 를 통째로 저장해 fetch 재요청 회피.
  const [selectedRow, setSelectedRow] = useState<AlertHistoryDetailRow | null>(null)
  // Phase 37-B (#445): 재발송 중인 row id (중복 클릭 방지).
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  // 재발송 성공 후 리스트 refetch trigger.
  const [refetchTick, setRefetchTick] = useState(0)

  // Codex P2 (#417 PR #424): 다중 kind 를 서버 쿼리로 전달 (`?kind=a&kind=b`) →
  // API 가 `in` 절로 필터 + 페이지네이션·집계가 정합. 클라 사이드 후처리 제거.
  const kindsKey = useMemo(() => Array.from(selectedKinds).sort().join(','), [selectedKinds])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const from = periodFromISO(days)
        const kinds = kindsKey ? kindsKey.split(',') : []

        const listParams = new URLSearchParams()
        listParams.set('from', from)
        listParams.set('limit', String(PAGE_SIZE))
        listParams.set('offset', String(offset))
        for (const k of kinds) listParams.append('kind', k)
        if (tickerFilter) listParams.set('ticker', tickerFilter)

        const statsParams = new URLSearchParams()
        statsParams.set('from', from)
        for (const k of kinds) statsParams.append('kind', k)
        if (tickerFilter) statsParams.set('ticker', tickerFilter)

        const [listRes, statsRes] = await Promise.all([
          fetch(`/api/alerts/history?${listParams.toString()}`),
          fetch(`/api/alerts/history/stats?${statsParams.toString()}`),
        ])
        const listJson = await listRes.json()
        const statsJson = await statsRes.json()
        if (cancelled) return
        if (!listRes.ok) throw new Error(listJson?.error ?? '이력 조회 실패')
        if (!statsRes.ok) throw new Error(statsJson?.error ?? '통계 조회 실패')

        setRows(listJson?.data ?? [])
        setTotal(listJson?.meta?.total ?? 0)
        setStats(statsJson?.data ?? null)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '알림 이력 조회 중 오류')
          // Codex #424 P2 (2회차): 필터/페이지 refresh 실패 시 이전 rows/total/stats 를
          // 그대로 두면 새 필터에 대해 stale 한 데이터 + 에러가 동시에 보임 → 초기화.
          setRows([])
          setTotal(0)
          setStats(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [days, kindsKey, tickerFilter, offset, refetchTick])

  // Phase 37-B (#445): 현재 필터 그대로 CSV export API 로 전달 → 파일 다운로드.
  const buildExportUrl = () => {
    const from = periodFromISO(days)
    const kinds = kindsKey ? kindsKey.split(',') : []
    const params = new URLSearchParams()
    params.set('from', from)
    for (const k of kinds) params.append('kind', k)
    if (tickerFilter) params.set('ticker', tickerFilter)
    return `/api/alerts/history/export?${params.toString()}`
  }

  // Phase 37-B self-review (#445, P0): `<a download>` 방식은 API 가 500 을 뱉으면
  // envelope JSON 이 `.csv` 확장자로 저장돼 사용자가 Excel 로 열기 전까지 실패를
  // 알아차리지 못한다. fetch → blob 으로 바꾸고 응답 헤더로 truncation 도 안내.
  const [csvDownloading, setCsvDownloading] = useState(false)
  const handleCsvDownload = async () => {
    if (csvDownloading) return
    setCsvDownloading(true)
    try {
      const res = await fetch(buildExportUrl())
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        setToast({ type: 'error', text: json?.error ?? 'CSV 다운로드 실패' })
        return
      }
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      try {
        const a = document.createElement('a')
        a.href = objectUrl
        const dateKey = new Date().toISOString().slice(0, 10)
        a.download = `alerts-history-${dateKey}.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      } finally {
        URL.revokeObjectURL(objectUrl)
      }
      if (res.headers.get('X-Truncated') === 'true') {
        const total = res.headers.get('X-Total-Count') ?? '?'
        setToast({
          type: 'error',
          text: `CSV 가 상한(10,000행)으로 잘렸습니다. 전체 ${total}행 — 필터를 좁혀 다시 받으세요.`,
        })
      }
    } catch (e) {
      setToast({ type: 'error', text: e instanceof Error ? e.message : 'CSV 다운로드 중 오류' })
    } finally {
      setCsvDownloading(false)
    }
  }

  const handleRetry = async (row: HistoryRow) => {
    if (retryingId) return
    if (row.deliveryStatus !== 'failed') {
      setToast({ type: 'error', text: '실패한 알림만 재발송할 수 있습니다.' })
      return
    }
    const ok = typeof window !== 'undefined'
      ? window.confirm('이 알림을 재발송하시겠습니까?\n동일 알림은 5분에 한 번만 재발송할 수 있습니다.')
      : true
    if (!ok) return
    setRetryingId(row.id)
    try {
      const res = await fetch(`/api/alerts/history/${row.id}/retry`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json?.success) {
        throw new Error(json?.error ?? '재발송에 실패했습니다.')
      }
      const status = json?.data?.status ?? 'sent'
      const msg = status === 'sent'
        ? '재발송 성공 — 새 이력이 추가되었습니다.'
        : status === 'partial'
          ? '일부 chat 에만 발송됨 — 이력이 추가되었습니다.'
          : '재발송 시도했으나 모두 실패 — 이력이 추가되었습니다.'
      setToast({ type: status === 'failed' ? 'error' : 'success', text: msg })
      setRefetchTick((t) => t + 1)
    } catch (e) {
      setToast({ type: 'error', text: e instanceof Error ? e.message : '재발송 중 오류' })
    } finally {
      setRetryingId(null)
    }
  }

  // toast 자동 소멸 (4s).
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const toggleKind = (k: AlertKind) => {
    setOffset(0)
    setSelectedKinds((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  const applyTicker = () => {
    setOffset(0)
    setTickerFilter(tickerInput.trim().toUpperCase())
  }

  const clearFilters = () => {
    setSelectedKinds(new Set())
    setTickerInput('')
    setTickerFilter('')
    setOffset(0)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  const successRate = useMemo(() => {
    if (!stats || stats.total === 0) return null
    const success = stats.byStatus.sent + stats.byStatus.partial * 0.5
    return (success / stats.total) * 100
  }, [stats])

  return (
    <div className="space-y-5">
      {/* Filter bar */}
      <section className="rounded-[14px] border border-border bg-card p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          {PERIOD_OPTIONS.map((p) => (
            <button
              key={p.key}
              onClick={() => { setDays(p.key); setOffset(0) }}
              className={`px-3 py-1.5 text-[12px] font-semibold rounded-md border transition-colors ${
                days === p.key
                  ? 'bg-sejin/25 text-sejin border-sejin/40'
                  : 'bg-surface border-border text-sub hover:text-bright'
              }`}
            >
              {p.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <input
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applyTicker() }}
              placeholder="티커 검색"
              className="bg-surface-dim border border-border rounded-md px-3 py-1.5 text-[13px] text-bright placeholder:text-dim focus:outline-none focus:border-sejin w-32"
            />
            <button
              onClick={applyTicker}
              className="px-3 py-1.5 text-[12px] font-semibold rounded-md border border-border bg-surface text-sub hover:text-bright"
            >
              적용
            </button>
            {(selectedKinds.size > 0 || tickerFilter) && (
              <button
                onClick={clearFilters}
                className="px-3 py-1.5 text-[12px] font-semibold rounded-md border border-border bg-surface text-sub hover:text-bright"
              >
                초기화
              </button>
            )}
            {/* Phase 37-B (#445): 현재 필터 그대로 CSV 다운로드.
                self-review P0: `<a download>` → fetch+blob 로 교체해 실패시 toast 표시,
                truncation 헤더도 사용자에게 통지. */}
            <button
              type="button"
              onClick={handleCsvDownload}
              disabled={csvDownloading}
              className="px-3 py-1.5 text-[12px] font-semibold rounded-md border border-sejin/40 bg-sejin/15 text-sejin hover:bg-sejin/25 disabled:opacity-50 disabled:cursor-wait"
            >
              {csvDownloading ? '다운로드 중…' : 'CSV 다운로드'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {KIND_META.map((m) => {
            const active = selectedKinds.has(m.key)
            return (
              <button
                key={m.key}
                onClick={() => toggleKind(m.key)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border transition-colors ${
                  active ? m.colorClass : 'bg-surface border-border text-sub hover:text-bright'
                }`}
              >
                {m.icon} {m.label}
              </button>
            )
          })}
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="총 발동" value={stats?.total ?? 0} tone="bright" />
        <StatCard
          label="전송 성공률"
          value={successRate == null ? '—' : `${successRate.toFixed(0)}%`}
          tone="sejin"
        />
        <StatCard label="종류" value={stats?.byKind.length ?? 0} tone="sodam" />
        <StatCard
          label="실패"
          value={stats?.byStatus.failed ?? 0}
          tone={stats?.byStatus.failed ? 'dasom' : 'sub'}
        />
      </section>

      {/* Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-[14px] border border-border bg-card p-4">
          <div className="text-[12px] text-sub mb-2">일별 발동 건수</div>
          <div className="h-[220px]">
            {stats && stats.byDay.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.byDay} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    tickFormatter={(s: string) => s.slice(5)}
                  />
                  <YAxis
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    allowDecimals={false}
                  />
                  <RTooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }}
                  />
                  <Line type="monotone" dataKey="count" stroke="#34d399" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-dim text-[13px]">데이터 없음</div>
            )}
          </div>
        </div>
        <div className="rounded-[14px] border border-border bg-card p-4">
          <div className="text-[12px] text-sub mb-2">종류별 발동</div>
          <div className="h-[220px]">
            {stats && stats.byKind.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.byKind}
                    dataKey="count"
                    nameKey="kind"
                    innerRadius={45}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {stats.byKind.map((entry, idx) => (
                      <Cell key={idx} fill={kindMetaOf(entry.kind)?.hex ?? '#94a3b8'} />
                    ))}
                  </Pie>
                  <RTooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }}
                    formatter={(value, name) => [value as number, kindMetaOf(String(name))?.label ?? String(name)]}
                  />
                  <Legend
                    formatter={(value: string) => kindMetaOf(value)?.label ?? value}
                    wrapperStyle={{ fontSize: '11px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-dim text-[13px]">데이터 없음</div>
            )}
          </div>
        </div>
      </section>

      {/* List */}
      <section className="rounded-[14px] border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-surface-dim flex items-center gap-2">
          <div className="text-[13px] font-bold text-bright">이력</div>
          <div className="text-[11px] text-sub">
            {total.toLocaleString()}건 · 페이지 {currentPage}/{totalPages}
          </div>
          {loading && <div className="ml-auto text-[11px] text-sub">불러오는 중…</div>}
        </div>
        {error && (
          <div className="px-5 py-4 text-[13px] text-red-400">{error}</div>
        )}
        {!error && rows.length === 0 && !loading && (
          <div className="px-5 py-8 text-center text-dim text-[13px]">해당 조건의 알림 이력이 없습니다.</div>
        )}
        {rows.length > 0 && (
          <ul>
            {rows.map((r) => {
              const meta = kindMetaOf(r.kind)
              const status = STATUS_META[r.deliveryStatus] ?? { label: r.deliveryStatus, colorClass: 'bg-surface text-sub border-border' }
              const isFailed = r.deliveryStatus === 'failed'
              const isRetrying = retryingId === r.id
              return (
                <li
                  key={r.id}
                  className="border-b border-border last:border-b-0"
                >
                  {/* Phase 37-B (#445): 상세 모달 오픈 버튼과 재발송 버튼을 sibling 으로 분리 —
                      nested <button> 회피 (HTML invalid). retry 는 실패 row 에만 노출. */}
                  <div className="flex items-stretch">
                    <button
                      type="button"
                      onClick={() => setSelectedRow(r)}
                      className="flex-1 min-w-0 text-left px-5 py-3 hover:bg-surface-dim transition-colors focus:outline-none focus:bg-surface-dim"
                      aria-label={`${meta?.label ?? r.kind} 상세 보기`}
                    >
                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="text-sub tabular-nums">{formatFiredAt(r.firedAt)}</span>
                        <span className={`px-2 py-0.5 rounded border font-semibold ${meta?.colorClass ?? 'bg-surface text-sub border-border'}`}>
                          {meta?.icon} {meta?.label ?? r.kind}
                        </span>
                        {r.ticker && (
                          <span className="px-2 py-0.5 rounded bg-surface-dim border border-border text-bright font-mono">
                            {r.ticker}
                          </span>
                        )}
                        <span className={`ml-auto px-2 py-0.5 rounded border font-semibold ${status.colorClass}`}>
                          {status.label} · {r.recipientCount}
                        </span>
                      </div>
                      <div className="mt-1.5 text-[13px] text-bright whitespace-pre-line">
                        {messageForDisplay(r.message, r.kind)}
                      </div>
                      {r.errorMessage && (
                        <div className="mt-1 text-[11px] text-red-400 font-mono">↳ {r.errorMessage}</div>
                      )}
                    </button>
                    {isFailed && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); void handleRetry(r) }}
                        disabled={retryingId !== null}
                        className="shrink-0 px-3 text-[11px] font-semibold text-red-300 border-l border-border hover:bg-red-500/10 hover:text-red-200 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-red-300"
                        aria-label="이 알림 재발송"
                      >
                        {isRetrying ? '재발송 중…' : '재발송'}
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {total > PAGE_SIZE && (
          <div className="px-5 py-3 border-t border-border flex items-center justify-between text-[12px]">
            <button
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0}
              className="px-3 py-1.5 rounded-md border border-border text-sub hover:text-bright disabled:opacity-40 disabled:hover:text-sub"
            >
              이전
            </button>
            <span className="text-sub">
              {currentPage}/{totalPages}
            </span>
            <button
              onClick={() => setOffset(offset + PAGE_SIZE)}
              disabled={offset + PAGE_SIZE >= total}
              className="px-3 py-1.5 rounded-md border border-border text-sub hover:text-bright disabled:opacity-40 disabled:hover:text-sub"
            >
              다음
            </button>
          </div>
        )}
      </section>

      {selectedRow && (
        <AlertHistoryDetailModal
          row={selectedRow}
          onClose={() => setSelectedRow(null)}
        />
      )}

      {/* Phase 37-B (#445): 재발송/CSV 결과 토스트. 자동 소멸 (4s) + 수동 닫기. */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg border shadow-lg text-[13px] font-semibold ${
            toast.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-100'
              : 'bg-red-500/15 border-red-400/50 text-red-100'
          }`}
        >
          <span>{toast.text}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-3 text-[11px] opacity-70 hover:opacity-100"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}

function StatCard({
  label, value, tone,
}: {
  label: string
  value: number | string
  tone: 'bright' | 'sejin' | 'sodam' | 'dasom' | 'sub'
}) {
  const toneClass = {
    bright: 'text-bright',
    sejin:  'text-sejin',
    sodam:  'text-sodam',
    dasom:  'text-dasom',
    sub:    'text-dim',
  }[tone]
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className={`text-[22px] font-extrabold tabular-nums ${toneClass}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className="text-[11px] text-sub mt-0.5">{label}</div>
    </div>
  )
}
