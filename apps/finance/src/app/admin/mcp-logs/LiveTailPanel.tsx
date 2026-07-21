/**
 * Phase 37-C (#446) — 실시간 MCP 로그 tail 패널.
 *
 * `EventSource` 로 `/api/admin/mcp-logs/stream` 을 구독. 부모 (McpLogsClient) 는
 * 현재 스냅샷 필터 (date/crash/level/msg/tool/traceId) 를 그대로 전달한다.
 *
 * - 오늘 KST 날짜 + 일반 로그만 지원 (서버 스코프와 동일). 다른 값이면 토글을 비활성화.
 * - 신규 라인은 최상단에 append, 최대 MAX_ROWS 유지.
 * - 자동 스크롤: 사용자가 컨테이너 top (scrollTop === 0) 근방에 있을 때만 다음
 *   append 후 top 으로 스냅. 아래로 스크롤한 상태이면 위치 유지 (읽던 라인 방해 X).
 * - 필터 조합이 변하거나 토글이 OFF 되면 EventSource 를 즉시 close.
 */

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { recentLogDates, formatKstTime } from '@/lib/mcp-logs/constants'

interface LiveTailPanelProps {
  date: string
  crash: boolean
  level: string
  msg: string
  tool: string
  traceId: string
}

interface LogRow {
  level: string
  time?: string
  msg?: string
  tool?: string
  latency_ms?: number
  traceId?: string
  status?: string
  err?: unknown
  raw?: string
  parseError?: boolean
  lineNo?: number
}

const MAX_ROWS = 500

const LEVEL_CLASS: Record<string, string> = {
  fatal: 'bg-red-500/20 text-red-400 border-red-500/40',
  error: 'bg-red-500/15 text-red-400 border-red-500/30',
  warn:  'bg-amber-500/15 text-amber-400 border-amber-500/30',
  info:  'bg-sky-500/15 text-sky-400 border-sky-500/30',
  debug: 'bg-sub/15 text-sub border-sub/30',
  trace: 'bg-sub/10 text-dim border-sub/20',
  unknown: 'bg-surface text-sub border-border',
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

export default function LiveTailPanel({
  date, crash, level, msg, tool, traceId,
}: LiveTailPanelProps) {
  const [on, setOn] = useState(false)
  const [rows, setRows] = useState<LogRow[]>([])
  const [status, setStatus] = useState<'idle' | 'connecting' | 'open' | 'error'>('idle')
  const listRef = useRef<HTMLDivElement | null>(null)
  const stickToTopRef = useRef(true)

  // 서버는 오늘 KST + 일반 로그만 tail. 조건 불충족이면 토글 비활성화.
  const isToday = useMemo(() => date === recentLogDates(1)[0], [date])
  const available = isToday && !crash

  // 토글이 사라진 상태 (date 변경 등) 로 진입하면 자동 OFF 처리.
  useEffect(() => {
    if (!available && on) setOn(false)
  }, [available, on])

  useEffect(() => {
    if (!on || !available) {
      setStatus('idle')
      return
    }

    // Codex #455 P2: 필터 변경 (또는 fresh 시작) 시 이전 rows 를 초기화.
    // 이전 필터의 라인이 새 필터 결과와 섞여 보이면 사용자에게 오해 유발
    // (예: level=error → level=info 로 바꿔도 옛 error 라인이 남음).
    // Toggle OFF 시에는 early return 하므로 클리어되지 않음 — 사용자가 방금
    // 본 라인을 유지하고 싶어할 수 있음.
    setRows([])

    const params = new URLSearchParams()
    if (level) params.set('level', level)
    if (msg) params.set('msg', msg)
    if (tool) params.set('tool', tool)
    if (traceId) params.set('traceId', traceId)

    const qs = params.toString()
    const url = qs
      ? `/api/admin/mcp-logs/stream?${qs}`
      : '/api/admin/mcp-logs/stream'

    setStatus('connecting')
    const es = new EventSource(url)

    es.onopen = () => setStatus('open')
    es.onerror = () => setStatus('error')
    es.onmessage = (ev) => {
      try {
        const entry = JSON.parse(ev.data) as LogRow
        setRows((prev) => {
          const next = [entry, ...prev]
          return next.length > MAX_ROWS ? next.slice(0, MAX_ROWS) : next
        })
      } catch {
        // JSON 파싱 실패 라인은 무시 (SSE 는 서버가 이미 JSON 화)
      }
    }

    return () => {
      es.close()
    }
  }, [on, available, level, msg, tool, traceId])

  // 사용자가 top 근방에 있을 때만 새 라인이 들어오면 top 유지.
  useEffect(() => {
    if (!listRef.current) return
    if (stickToTopRef.current) listRef.current.scrollTop = 0
  }, [rows])

  const onScroll = () => {
    if (!listRef.current) return
    // 8px 미만이면 top 에 붙어있다고 간주.
    stickToTopRef.current = listRef.current.scrollTop < 8
  }

  const statusLabel = (() => {
    switch (status) {
      case 'connecting': return '연결 중…'
      case 'open': return '연결됨'
      case 'error': return '연결 오류 — 재시도 중'
      default: return '중단'
    }
  })()
  const statusClass = {
    idle: 'text-dim',
    connecting: 'text-amber-400',
    open: 'text-emerald-400',
    error: 'text-red-400',
  }[status]

  return (
    <section className="rounded-[14px] border border-border bg-card p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[13px] font-bold text-bright">실시간 tail</div>
        <div className="text-[11px] text-sub">
          오늘(KST) 일반 로그의 새 라인만 push합니다. 최대 {MAX_ROWS}건.
        </div>
        <div className="ml-auto flex items-center gap-2">
          {on && <span className={`text-[11px] font-semibold ${statusClass}`}>● {statusLabel}</span>}
          {rows.length > 0 && (
            <button
              onClick={() => setRows([])}
              className="px-2.5 py-1 text-[11px] font-semibold rounded-md border border-border bg-surface text-sub hover:text-bright"
            >
              지우기
            </button>
          )}
          <button
            onClick={() => setOn((prev) => !prev)}
            disabled={!available}
            className={`px-3 py-1.5 text-[12px] font-semibold rounded-md border transition-colors ${
              !available
                ? 'bg-surface border-border text-dim opacity-60 cursor-not-allowed'
                : on
                  ? 'bg-sejin/25 text-sejin border-sejin/40'
                  : 'bg-surface border-border text-sub hover:text-bright'
            }`}
            title={!available ? '오늘 KST + 일반 로그에서만 지원됩니다.' : undefined}
          >
            {on ? '⏸ 중지' : '▶ 시작'}
          </button>
        </div>
      </div>

      {!available && (
        <div className="text-[12px] text-amber-400">
          실시간 tail 은 오늘(KST) 일반 로그에서만 동작합니다. 파일 / 크래시 설정을 변경해 주세요.
        </div>
      )}

      {available && on && (
        <div
          ref={listRef}
          onScroll={onScroll}
          className="max-h-[420px] overflow-y-auto border border-border rounded-md bg-surface-dim"
        >
          {rows.length === 0 && (
            <div className="px-4 py-6 text-center text-dim text-[12px]">
              새 라인을 기다리는 중…
            </div>
          )}
          {rows.length > 0 && (
            <ul className="divide-y divide-border">
              {rows.map((r, idx) => {
                const levelCls = LEVEL_CLASS[r.level] ?? LEVEL_CLASS.unknown
                return (
                  <li key={`${r.lineNo ?? ''}-${idx}`} className="px-4 py-2 hover:bg-surface transition-colors">
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      {/* lineNo 는 poll batch 마다 1 부터 재시작해 스냅샷의 파일 라인
                          번호 (L{n}) 와 오해 유발 (Codex #454 P1). live tail 은 표시 안함. */}
                      <span className="text-sub tabular-nums" title="KST">{formatKstTime(r.time)}</span>
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
                        <span className="text-sub text-[11px] tabular-nums">{r.latency_ms} ms</span>
                      )}
                      {r.traceId && (
                        <span className="text-dim text-[11px] font-mono ml-auto">t:{r.traceId}</span>
                      )}
                    </div>
                    {r.err != null && (
                      <div className="mt-1 text-[12px] text-red-400 font-mono">
                        err: {shortJson(r.err)}
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
        </div>
      )}
    </section>
  )
}
