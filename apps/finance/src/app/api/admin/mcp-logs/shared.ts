/**
 * Phase 33-C (#418) — MCP 로그 대시보드 API 공용.
 */

import path from 'node:path'
import fs from 'node:fs'
import { LEVEL_ORDER, KNOWN_MSGS } from '@/lib/mcp-logs/constants'
import { parseLines, applyFilter, tailN, type Filter, type LogEntry } from '@/lib/mcp-logs/parser'

/** KST 오늘 (YYYY-MM-DD) */
export function todayKst(now: number = Date.now()): string {
  const kst = new Date(now + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

export const KNOWN_LEVELS = new Set<string>(LEVEL_ORDER)
export const KNOWN_MSG_SET = new Set<string>(KNOWN_MSGS)

const LOG_DIR = process.env.MCP_LOG_DIR ?? path.join(process.cwd(), 'logs')

/** 대시보드가 한 요청당 파싱할 최대 라인 (대용량 파일 방어). */
export const MAX_SCAN_LINES = 50_000

/**
 * 파일 EOF 부근에서 최대 이 바이트만 읽어들여 memory / event-loop 를 보호 (Codex #425 P2).
 * `readFileSync` 로 전체를 읽으면 수백 MB 로그가 있을 때 Next.js 프로세스 전체가 블록됨.
 * 50k 라인 × 평균 ~320B → 16MB 면 충분. 여유로 8MB → 대략 25k~40k 라인 커버.
 * 8MB 초과분은 오래된 데이터라 대시보드 UX (최근 조회) 상 손실 무의미.
 */
export const MAX_TAIL_BYTES = 8 * 1024 * 1024

/**
 * `crash` true 이면 `logs/mcp-crash-YYYY-MM-DD.log`, 아니면 `logs/mcp-YYYY-MM-DD.log`.
 */
export function logFilePath(date: string, crash = false): string {
  const name = crash ? `mcp-crash-${date}.log` : `mcp-${date}.log`
  return path.join(LOG_DIR, name)
}

/**
 * YYYY-MM-DD 형식 검증 (Codex #425 P3 반영).
 * `new Date('2026-02-31...')` 은 `2026-03-03` 으로 정규화되어 `isNaN` 이 false → 통과됨.
 * 파싱 결과 y/m/d 가 입력값과 동일한지 재확인해 캘린더 무효 날짜를 거부.
 */
export function isValidDateStr(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const d = new Date(Date.UTC(year, month - 1, day))
  if (Number.isNaN(d.getTime())) return false
  return d.getUTCFullYear() === year
    && d.getUTCMonth() + 1 === month
    && d.getUTCDate() === day
}

export interface LoadOptions {
  date: string
  crash?: boolean
  filter: Filter
}

export interface LoadResult {
  entries: LogEntry[]
  fileExists: boolean
  fileSize: number
  /** MAX_TAIL_BYTES 초과로 앞쪽이 잘렸는지 (총 라인 수 정확 카운트 불가) */
  truncatedHead: boolean
  /** 파일 전체 라인 수 (truncatedHead=true 이면 최소치, 실제 파일은 더 많음) */
  totalLines: number
  scanned: number
  /** tail 이 적용됐다면 원본 대비 시작 라인 번호 (1-indexed). truncated 시 근사치. */
  startLineNo: number
}

/**
 * 첫 partial 라인 제거 — EOF 부근에서 raw 바이트를 읽으면 첫 라인이 잘린
 * 상태일 가능성이 큼. 첫 `\n` 이전은 버림 (pure, 테스트 가능).
 */
export function stripLeadingPartialLine(text: string): string {
  const idx = text.indexOf('\n')
  return idx < 0 ? '' : text.slice(idx + 1)
}

/**
 * 파일 EOF 에서 최대 `MAX_TAIL_BYTES` 만큼만 읽어 반환 (Codex #425 P2).
 * 파일 사이즈가 그 이하면 그대로 전체 반환. 초과 시 첫 partial 라인 제거.
 */
function readTail(filePath: string): { text: string; size: number; truncated: boolean } {
  const st = fs.statSync(filePath)
  if (st.size <= MAX_TAIL_BYTES) {
    return { text: fs.readFileSync(filePath, 'utf-8'), size: st.size, truncated: false }
  }
  const fd = fs.openSync(filePath, 'r')
  try {
    const buf = Buffer.alloc(MAX_TAIL_BYTES)
    fs.readSync(fd, buf, 0, MAX_TAIL_BYTES, st.size - MAX_TAIL_BYTES)
    const raw = buf.toString('utf-8')
    return { text: stripLeadingPartialLine(raw), size: st.size, truncated: true }
  } finally {
    fs.closeSync(fd)
  }
}

/**
 * 파일 로드 → tail-N → 파싱 → 필터. Entries 는 파일 순 (오래된 → 최신). UI 는 결과를
 * reverse 해 최신순 노출.
 * Codex #425 P2: 대용량 파일은 전체를 메모리에 로드하지 않고 EOF 부근 `MAX_TAIL_BYTES`
 * 만 읽어 첫 partial 라인을 잘라낸 뒤 처리.
 */
export function loadEntries(opts: LoadOptions): LoadResult {
  const filePath = logFilePath(opts.date, opts.crash)
  if (!fs.existsSync(filePath)) {
    return {
      entries: [], fileExists: false, fileSize: 0, truncatedHead: false,
      totalLines: 0, scanned: 0, startLineNo: 1,
    }
  }
  const { text: raw, size, truncated } = readTail(filePath)
  const rawLineCount = raw.split('\n').filter((l) => l.trim()).length
  const { text, startLineNo } = tailN(raw, MAX_SCAN_LINES)
  const parsed = parseLines(text)
  // startLineNo 를 오프셋으로 반영. truncatedHead 이면 원본 line 번호는 알 수 없어
  // 읽어들인 창 내부 line 번호 그대로 (사용자에게는 "L<number>" 로만 노출).
  for (const e of parsed) e.lineNo = (e.lineNo ?? 1) + startLineNo - 1
  const filtered = applyFilter(parsed, opts.filter)
  return {
    entries: filtered,
    fileExists: true,
    fileSize: size,
    truncatedHead: truncated,
    totalLines: rawLineCount,
    scanned: parsed.length,
    startLineNo,
  }
}
