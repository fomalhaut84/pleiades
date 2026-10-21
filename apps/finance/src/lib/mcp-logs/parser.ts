/**
 * Phase 33-C (#418) — MCP pino JSON lines 파싱 + 필터.
 * pure — filesystem I/O 는 route 에서 담당, 이 파일은 이미 읽은 텍스트에 대해 동작.
 */

import { KNOWN_MSGS } from './constants'

export interface LogEntry {
  level: string
  time?: string
  pid?: number
  service?: string
  msg?: string
  tool?: string
  args?: unknown
  latency_ms?: number
  traceId?: string
  status?: string
  err?: unknown
  /** 원본 문자열 (파싱 실패 시 그대로 노출) */
  raw?: string
  /** 파싱 실패 여부 */
  parseError?: boolean
  /** 원본 파일에서의 line 번호 (1-indexed) */
  lineNo?: number
}

export interface Filter {
  level?: string
  msg?: string
  tool?: string
  traceId?: string
}

/**
 * pino JSON lines 텍스트 → LogEntry 배열. 빈 라인 skip. 파싱 실패는 raw 로 노출.
 * pino 는 numeric level (`{"level":30,...}`) 을 출력할 수 있어 formatter 없이는
 * 문자열이 아닐 수 있으나 이 프로젝트는 `formatters.level = label` 로 문자열 출력.
 * 다만 방어적으로 numeric → 문자열 매핑.
 */
const NUMERIC_LEVEL: Record<number, string> = {
  10: 'trace', 20: 'debug', 30: 'info', 40: 'warn', 50: 'error', 60: 'fatal',
}

export function parseLines(text: string): LogEntry[] {
  const entries: LogEntry[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>
      let level = parsed.level
      if (typeof level === 'number') level = NUMERIC_LEVEL[level] ?? String(level)
      entries.push({
        ...parsed,
        level: typeof level === 'string' ? level : 'info',
        lineNo: i + 1,
      } as LogEntry)
    } catch {
      entries.push({ level: 'unknown', msg: line.slice(0, 200), raw: line, parseError: true, lineNo: i + 1 })
    }
  }
  return entries
}

export function applyFilter(entries: LogEntry[], f: Filter): LogEntry[] {
  const level = f.level?.trim()
  const msg = f.msg?.trim()
  const tool = f.tool?.trim().toLowerCase()
  const traceId = f.traceId?.trim()
  if (!level && !msg && !tool && !traceId) return entries
  return entries.filter((e) => {
    if (level && e.level !== level) return false
    if (msg && e.msg !== msg) return false
    if (tool) {
      const t = typeof e.tool === 'string' ? e.tool.toLowerCase() : ''
      if (!t.includes(tool)) return false
    }
    if (traceId && e.traceId !== traceId) return false
    return true
  })
}

/**
 * 대용량 파일 대응 — 텍스트 마지막 N 라인만 잘라서 반환.
 * pino 로그는 매 record 끝에 `\n` → `split('\n')` 결과 마지막 원소가 `''` (빈 문자열).
 * 이 empty 를 count/slice 에 포함하면 실제 반환되는 라인이 1개 부족 (Codex #425 P3).
 * → 후행 empty 를 잘라낸 "effective" 배열로 count 와 slice 를 수행.
 * 원본 파일 line 번호를 유지하기 위해 시작 라인 번호 (1-indexed) 도 함께 반환.
 */
export function tailN(text: string, maxLines: number): { text: string; startLineNo: number } {
  if (maxLines <= 0) return { text: '', startLineNo: 1 }
  const lines = text.split('\n')
  const effective = lines.length > 0 && lines[lines.length - 1] === ''
    ? lines.slice(0, -1)
    : lines
  if (effective.length <= maxLines) return { text, startLineNo: 1 }
  const start = effective.length - maxLines
  return {
    text: effective.slice(start).join('\n'),
    startLineNo: start + 1,
  }
}

/**
 * 집계용 통계.
 * `latency` 는 tool_call 만 대상 (latency_ms 있는 항목).
 */
export interface Stats {
  total: number
  byLevel: Array<{ level: string; count: number }>
  byMsg: Array<{ msg: string; count: number }>
  byTool: Array<{ tool: string; count: number; errors: number }>
  latencyByTool: Array<{ tool: string; avg_ms: number; p95_ms: number; p99_ms: number; count: number }>
  errorRate: number
}

const ERROR_LEVELS = new Set(['error', 'fatal', 'warn'])

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil(sorted.length * p) - 1
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))]
}

export function computeStats(entries: LogEntry[]): Stats {
  const byLevelMap = new Map<string, number>()
  const byMsgMap = new Map<string, number>()
  const byToolMap = new Map<string, { count: number; errors: number }>()
  const latencyByToolRaw = new Map<string, number[]>()
  let errors = 0

  for (const e of entries) {
    byLevelMap.set(e.level, (byLevelMap.get(e.level) ?? 0) + 1)
    if (e.msg) byMsgMap.set(e.msg, (byMsgMap.get(e.msg) ?? 0) + 1)
    if (ERROR_LEVELS.has(e.level)) errors++

    if (typeof e.tool === 'string' && e.tool) {
      const row = byToolMap.get(e.tool) ?? { count: 0, errors: 0 }
      row.count++
      if (e.status === 'error' || ERROR_LEVELS.has(e.level)) row.errors++
      byToolMap.set(e.tool, row)

      if (e.msg === 'tool_call' && typeof e.latency_ms === 'number') {
        const arr = latencyByToolRaw.get(e.tool) ?? []
        arr.push(e.latency_ms)
        latencyByToolRaw.set(e.tool, arr)
      }
    }
  }

  const byLevel = Array.from(byLevelMap.entries())
    .map(([level, count]) => ({ level, count }))
    .sort((a, b) => b.count - a.count)

  const byMsg = Array.from(byMsgMap.entries())
    .map(([msg, count]) => ({ msg, count }))
    .sort((a, b) => b.count - a.count)

  const byTool = Array.from(byToolMap.entries())
    .map(([tool, r]) => ({ tool, count: r.count, errors: r.errors }))
    .sort((a, b) => b.count - a.count)

  const latencyByTool = Array.from(latencyByToolRaw.entries()).map(([tool, samples]) => {
    const sorted = [...samples].sort((a, b) => a - b)
    const avg = sorted.reduce((s, v) => s + v, 0) / sorted.length
    return {
      tool,
      avg_ms: Math.round(avg),
      p95_ms: Math.round(percentile(sorted, 0.95)),
      p99_ms: Math.round(percentile(sorted, 0.99)),
      count: sorted.length,
    }
  }).sort((a, b) => b.count - a.count)

  return {
    total: entries.length,
    byLevel,
    byMsg,
    byTool,
    latencyByTool,
    errorRate: entries.length === 0 ? 0 : errors / entries.length,
  }
}

export function knownMsgs(): readonly string[] {
  return KNOWN_MSGS
}
