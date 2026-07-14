'use client'

import { useEffect, useMemo, useState } from 'react'
import { KNOWN_MSGS, MSG_LABELS, LEVEL_ORDER, recentLogDates } from '@/lib/mcp-logs/constants'
import LiveTailPanel from './LiveTailPanel'

interface LogRow {
  level: string
  time?: string
  msg?: string
  tool?: string
  args?: unknown
  latency_ms?: number
  traceId?: string
  status?: string
  err?: unknown
  raw?: string
  parseError?: boolean
  lineNo?: number
}

interface ListResponse {
  items: LogRow[]
  date: string
  crash: boolean
  fileExists: boolean
  fileSize: number
  truncatedHead: boolean
  totalLines: number
  scannedLines: number
  tailStartLineNo: number
}

interface Stats {
  total: number
  byLevel: Array<{ level: string; count: number }>
  byMsg: Array<{ msg: string; count: number }>
  byTool: Array<{ tool: string; count: number; errors: number }>
  latencyByTool: Array<{ tool: string; avg_ms: number; p95_ms: number; p99_ms: number; count: number }>
  errorRate: number
  date: string
  crash: boolean
  fileExists: boolean
  totalLines: number
  scannedLines: number
}

const PAGE_SIZE = 50

const LEVEL_CLASS: Record<string, string> = {
  fatal: 'bg-red-500/20 text-red-400 border-red-500/40',
  error: 'bg-red-500/15 text-red-400 border-red-500/30',
  warn:  'bg-amber-500/15 text-amber-400 border-amber-500/30',
  info:  'bg-sky-500/15 text-sky-400 border-sky-500/30',
  debug: 'bg-sub/15 text-sub border-sub/30',
  trace: 'bg-sub/10 text-dim border-sub/20',
  unknown: 'bg-surface text-sub border-border',
}

function formatDuration(ms?: number): string {
  if (typeof ms !== 'number') return ''
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

function shortJson(v: unknown, max = 160): string {
  if (v == null) return ''
  try {
    const s = JSON.stringify(v)
    return s.length > max ? s.slice(0, max) + '…' : s
  } catch {
    return String(v).slice(0, max)
  }
}

export default function McpLogsClient() {
  const dateOptions = useMemo(() => recentLogDates(7), [])
  const [date, setDate] = useState(dateOptions[0])
  const [crash, setCrash] = useState(false)
  const [level, setLevel] = useState<string>('')
  const [msg, setMsg] = useState<string>('')
  const [toolInput, setToolInput] = useState('')
  const [toolFilter, setToolFilter] = useState('')
  const [traceInput, setTraceInput] = useState('')
  const [traceFilter, setTraceFilter] = useState('')
  const [offset, setOffset] = useState(0)
  const [rows, setRows] = useState<LogRow[]>([])
  const [meta, setMeta] = useState<Omit<ListResponse, 'items'> | null>(null)
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const p = new URLSearchParams()
        p.set('date', date)
        if (crash) p.set('crash', '1')
        if (level) p.set('level', level)
        if (msg) p.set('msg', msg)
        if (toolFilter) p.set('tool', toolFilter)
        if (traceFilter) p.set('traceId', traceFilter)

        const listP = new URLSearchParams(p)
        listP.set('limit', String(PAGE_SIZE))
        listP.set('offset', String(offset))

        const [listRes, statsRes] = await Promise.all([
          fetch(`/api/admin/mcp-logs?${listP.toString()}`),
          fetch(`/api/admin/mcp-logs/stats?${p.toString()}`),
        ])
        const listJson = await listRes.json()
        const statsJson = await statsRes.json()
        if (cancelled) return
        if (!listRes.ok) throw new Error(listJson?.error ?? '로그 조회 실패')
        if (!statsRes.ok) throw new Error(statsJson?.error ?? '통계 조회 실패')

        const listData = listJson?.data as ListResponse | undefined
        setRows(listData?.items ?? [])
        setTotal(listJson?.meta?.total ?? 0)
        setMeta(listData ? { ...listData, items: [] as never } as never : null)
        setStats(statsJson?.data ?? null)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '로그 조회 중 오류')
          // self-review P1 (#418): meta 도 함께 초기화. 남겨두면 새 필터에 대해
          // 이전 파일의 totalLines/scannedLines 헤더가 stale 하게 노출됨.
          setRows([])
          setTotal(0)
          setStats(null)
          setMeta(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [date, crash, level, msg, toolFilter, traceFilter, offset])

  const applyTool = () => { setOffset(0); setToolFilter(toolInput.trim()) }
  const applyTrace = () => { setOffset(0); setTraceFilter(traceInput.trim()) }
  const clearAll = () => {
    setLevel(''); setMsg('')
    setToolInput(''); setToolFilter('')
    setTraceInput(''); setTraceFilter('')
    setOffset(0)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  return (
    <div className="space-y-5">
      {/* Filter bar */}
      <section className="rounded-[14px] border border-border bg-card p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <label className="text-[12px] text-sub mr-1">파일</label>
          <select
            value={date}
            onChange={(e) => { setDate(e.target.value); setOffset(0) }}
            className="bg-surface-dim border border-border rounded-md px-2.5 py-1.5 text-[12px] text-bright"
          >
            {dateOptions.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <button
            onClick={() => { setCrash(false); setOffset(0) }}
            className={`px-3 py-1.5 text-[12px] font-semibold rounded-md border ${
              !crash ? 'bg-sejin/25 text-sejin border-sejin/40' : 'bg-surface border-border text-sub hover:text-bright'
            }`}
          >
            일반
          </button>
          <button
            onClick={() => { setCrash(true); setOffset(0) }}
            className={`px-3 py-1.5 text-[12px] font-semibold rounded-md border ${
              crash ? 'bg-red-500/25 text-red-400 border-red-500/40' : 'bg-surface border-border text-sub hover:text-bright'
            }`}
          >
            💀 크래시
          </button>

          <div className="ml-auto flex items-center gap-2">
            <input
              value={traceInput}
              onChange={(e) => setTraceInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applyTrace() }}
              placeholder="traceId"
              className="bg-surface-dim border border-border rounded-md px-3 py-1.5 text-[12px] font-mono text-bright w-32"
            />
            <input
              value={toolInput}
              onChange={(e) => setToolInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applyTool() }}
              placeholder="tool 이름"
              className="bg-surface-dim border border-border rounded-md px-3 py-1.5 text-[12px] font-mono text-bright w-32"
            />
            <button
              onClick={() => { applyTool(); applyTrace() }}
              className="px-3 py-1.5 text-[12px] font-semibold rounded-md border border-border bg-surface text-sub hover:text-bright"
            >
              적용
            </button>
            {(level || msg || toolFilter || traceFilter) && (
              <button
                onClick={clearAll}
                className="px-3 py-1.5 text-[12px] font-semibold rounded-md border border-border bg-surface text-sub hover:text-bright"
              >
                초기화
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="text-[11px] text-dim self-center mr-1">Level:</span>
          {['', ...LEVEL_ORDER].map((l) => {
            const active = level === l
            const cls = active
              ? (l ? LEVEL_CLASS[l] : 'bg-sejin/25 text-sejin border-sejin/40')
              : 'bg-surface border-border text-sub hover:text-bright'
            return (
              <button
                key={l || 'all'}
                onClick={() => { setLevel(l); setOffset(0) }}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border transition-colors ${cls}`}
              >
                {l || '전체'}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="text-[11px] text-dim self-center mr-1">Msg:</span>
          {['', ...KNOWN_MSGS].map((m) => {
            const active = msg === m
            return (
              <button
                key={m || 'all'}
                onClick={() => { setMsg(m); setOffset(0) }}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border transition-colors ${
                  active
                    ? 'bg-sodam/25 text-sodam border-sodam/40'
                    : 'bg-surface border-border text-sub hover:text-bright'
                }`}
                title={m}
              >
                {m ? (MSG_LABELS[m] ?? m) : '전체'}
              </button>
            )
          })}
        </div>
      </section>

      {/* Live tail (Phase 37-C, #446) */}
      <LiveTailPanel
        date={date}
        crash={crash}
        level={level}
        msg={msg}
        tool={toolFilter}
        traceId={traceFilter}
      />

      {/* Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="총 이벤트" value={stats?.total ?? 0} />
        <StatCard
          label="에러율"
          value={stats && stats.total > 0 ? `${(stats.errorRate * 100).toFixed(1)}%` : '—'}
          tone={(stats?.errorRate ?? 0) > 0.05 ? 'dasom' : 'sejin'}
        />
        <StatCard label="유니크 tool" value={stats?.byTool.length ?? 0} tone="sodam" />
        <StatCard
          label="fatal"
          value={stats?.byLevel.find((b) => b.level === 'fatal')?.count ?? 0}
          tone={(stats?.byLevel.find((b) => b.level === 'fatal')?.count ?? 0) > 0 ? 'dasom' : 'sub'}
        />
      </section>

      {/* Tool latency top 5 */}
      {stats && stats.latencyByTool.length > 0 && (
        <section className="rounded-[14px] border border-border bg-card p-4">
          <div className="text-[12px] text-sub mb-3">Tool latency (tool_call 기준, ms)</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[12px]">
            {stats.latencyByTool.slice(0, 8).map((t) => (
              <div key={t.tool} className="flex items-center justify-between border border-border rounded-md px-3 py-2 bg-surface-dim">
                <div className="font-mono text-bright truncate max-w-[180px]" title={t.tool}>{t.tool}</div>
                <div className="text-sub text-[11px] tabular-nums whitespace-nowrap">
                  n={t.count} · avg {t.avg_ms} · p95 {t.p95_ms} · p99 {t.p99_ms}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* List */}
      <section className="rounded-[14px] border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-surface-dim flex items-center gap-3 flex-wrap">
          <div className="text-[13px] font-bold text-bright">
            {crash ? '크래시 로그' : '전체 로그'}
          </div>
          <div className="text-[11px] text-sub">
            {total.toLocaleString()} / {meta?.truncatedHead ? '창' : '파일'} {meta?.totalLines?.toLocaleString() ?? '?'} 라인
            {meta && meta.scannedLines < meta.totalLines && (
              <span className="ml-2 text-amber-400">(최근 {meta.scannedLines.toLocaleString()} 만 스캔)</span>
            )}
            {meta?.truncatedHead && (
              <span className="ml-2 text-amber-400">
                (파일 {(meta.fileSize / (1024 * 1024)).toFixed(1)}MB — EOF 8MB 창만 로드)
              </span>
            )}
          </div>
          <div className="ml-auto text-[11px] text-sub">
            {total > 0 && `페이지 ${currentPage}/${totalPages}`}
            {loading && <span className="ml-2">불러오는 중…</span>}
          </div>
        </div>
        {error && <div className="px-5 py-4 text-[13px] text-red-400">{error}</div>}
        {!error && !meta?.fileExists && !loading && (
          <div className="px-5 py-8 text-center text-dim text-[13px]">
            {date} 로그 파일이 없습니다 (MCP_LOG_TEE_FILE=1 필요).
          </div>
        )}
        {!error && meta?.fileExists && rows.length === 0 && !loading && (
          <div className="px-5 py-8 text-center text-dim text-[13px]">
            해당 필터에 매칭되는 라인이 없습니다.
          </div>
        )}
        {rows.length > 0 && (
          <ul className="divide-y divide-border">
            {rows.map((r, idx) => {
              const levelCls = LEVEL_CLASS[r.level] ?? LEVEL_CLASS.unknown
              return (
                <li key={`${r.lineNo ?? idx}`} className="px-5 py-3 hover:bg-surface-dim transition-colors">
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="text-dim font-mono">L{r.lineNo}</span>
                    <span className="text-sub tabular-nums">{r.time?.slice(11, 19)}</span>
                    <span className={`px-2 py-0.5 rounded border font-semibold ${levelCls}`}>{r.level}</span>
                    {r.msg && (
                      <span className="px-2 py-0.5 rounded bg-surface-dim border border-border text-bright font-mono">
                        {r.msg}
                      </span>
                    )}
                    {r.tool && (
                      <span className="px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/25 text-sky-400 font-mono">
                        {r.tool}
                      </span>
                    )}
                    {typeof r.latency_ms === 'number' && (
                      <span className="text-sub text-[11px] tabular-nums">{formatDuration(r.latency_ms)}</span>
                    )}
                    {r.traceId && (
                      <span className="text-dim text-[11px] font-mono ml-auto">t:{r.traceId}</span>
                    )}
                  </div>
                  {r.err != null && (
                    <div className="mt-1.5 text-[12px] text-red-400 font-mono">
                      err: {shortJson(r.err)}
                    </div>
                  )}
                  {r.args != null && (
                    <div className="mt-1 text-[11px] text-sub font-mono">
                      args: {shortJson(r.args)}
                    </div>
                  )}
                  {r.parseError && r.raw && (
                    <div className="mt-1 text-[11px] text-amber-400 font-mono">raw: {r.raw.slice(0, 200)}</div>
                  )}
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
            <span className="text-sub">{currentPage}/{totalPages}</span>
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
    </div>
  )
}

function StatCard({
  label, value, tone = 'bright',
}: {
  label: string
  value: number | string
  tone?: 'bright' | 'sejin' | 'sodam' | 'dasom' | 'sub'
}) {
  const toneClass = {
    bright: 'text-bright',
    sejin: 'text-sejin',
    sodam: 'text-sodam',
    dasom: 'text-dasom',
    sub: 'text-dim',
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
