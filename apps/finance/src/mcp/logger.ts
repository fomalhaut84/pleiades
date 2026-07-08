/**
 * MCP structured logging — Phase 32-C.
 *
 * pino 기반 구조화 로그를 sync 스트림으로 출력.
 * - HTTP 모드: stdout (PM2 log 흡수)
 * - stdio 모드: stderr (stdout 은 MCP JSON-RPC 채널이라 섞이면 프로토콜 파손)
 *
 * pino.transport (worker thread) 는 esbuild 번들에서 worker 파일 참조 문제로 로그 유실
 * 가능 → sync destination + multistream 만 사용.
 *
 * 옵션: `MCP_LOG_TEE_FILE=1` 로 프로젝트 루트 `logs/mcp-YYYY-MM-DD.log` tee 활성화.
 * 파일명 날짜는 KST (Asia/Seoul) 기준 — 한국 시간대 자정에 새 파일로 교체.
 */

import pino from 'pino'
import path from 'node:path'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'

const LOG_DIR = process.env.MCP_LOG_DIR ?? path.join(process.cwd(), 'logs')
const LOG_ENABLE_FILE = process.env.MCP_LOG_TEE_FILE === '1'
const LOG_LEVEL = process.env.MCP_LOG_LEVEL ?? 'info'
// stdio 모드에서는 stdout 이 MCP JSON-RPC 통신 채널이라 로그가 섞이면 프로토콜 파손.
// 로그는 stderr 로 라우팅. HTTP 모드에서는 stdout 이 자유이므로 그대로 (PM2 로그 흡수).
export const IS_STDIO_MODE = (process.env.MCP_TRANSPORT ?? 'stdio') === 'stdio'
const LOG_OUT_STREAM = IS_STDIO_MODE ? process.stderr : process.stdout

/**
 * KST 기준 오늘 날짜 (YYYY-MM-DD).
 * UTC 기준을 쓰면 KST 자정 (UTC 15:00) 과 실제 파일명 회전 (UTC 자정, KST 09:00) 이
 * 어긋나 KST 00:00~09:00 로그가 "전날" 파일에 append 됨 → 사후 조회 혼선. KST 로 통일.
 */
function kstDateString(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

const LOG_RETENTION_DAYS = parseInt(process.env.MCP_LOG_RETENTION_DAYS ?? '14', 10)

let currentFileStream: pino.DestinationStream | null = null
let currentFileDate = ''

/**
 * Phase 33-C (#418, #409 흡수): fatal 만 별도로 tee 되는 파일.
 * `logs/mcp-crash-YYYY-MM-DD.log` — pm2 상태 진단 시 crash 만 빠르게 스캔.
 * 일반 로그와 rotation·retention 동일 (KST 자정, 14일).
 */
let currentCrashStream: pino.DestinationStream | null = null

/**
 * 오래된 로그 파일 정리 — 14일 (기본) 초과 시 삭제.
 * 매 rotation 시점과 부팅 시점에 실행. 실패는 조용히 넘김 (best effort).
 */
function pruneOldLogs(): void {
  if (!LOG_ENABLE_FILE || LOG_RETENTION_DAYS <= 0) return
  const cutoffMs = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000
  try {
    const files = fs.readdirSync(LOG_DIR)
    for (const f of files) {
      if (!f.startsWith('mcp-') || !f.endsWith('.log')) continue
      const filePath = path.join(LOG_DIR, f)
      try {
        const stat = fs.statSync(filePath)
        if (stat.mtimeMs < cutoffMs) {
          fs.unlinkSync(filePath)
        }
      } catch { /* per-file ignore */ }
    }
  } catch { /* dir read ignore */ }
}

function openFileStream(): pino.DestinationStream | null {
  if (!LOG_ENABLE_FILE) return null
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    currentFileDate = kstDateString()
    const filePath = path.join(LOG_DIR, `mcp-${currentFileDate}.log`)
    const stream = pino.destination({ dest: filePath, sync: true, mkdir: true })
    // 새 파일 생성 후 오래된 파일 정리 (14일 retention).
    pruneOldLogs()
    return stream
  } catch (error) {
    // 파일 로거 초기화 실패는 stdout/stderr only 로 fallback.
    // stdio 모드에서도 로거는 stderr 이라 프로토콜 채널과 충돌 없음.
    console.error('[mcp/logger] file tee 초기화 실패:', LOG_DIR, error)
    return null
  }
}

/**
 * Phase 33-C (#418): crash 전용 tee 파일 스트림 open.
 * `logs/mcp-crash-<KST-date>.log`. LOG_ENABLE_FILE 이 켜져 있을 때만 활성.
 */
function openCrashFileStream(): pino.DestinationStream | null {
  if (!LOG_ENABLE_FILE) return null
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    const dateStr = currentFileDate || kstDateString()
    const filePath = path.join(LOG_DIR, `mcp-crash-${dateStr}.log`)
    return pino.destination({ dest: filePath, sync: true, mkdir: true })
  } catch (error) {
    console.error('[mcp/logger] crash tee 초기화 실패:', LOG_DIR, error)
    return null
  }
}

/**
 * 자정 감지 후 파일 스트림 교체. 5분 주기 setInterval (로그 시점마다 검사 X).
 * 순서: flushSync (in-flight write 안전) → 새 stream open → old stream end.
 */
function scheduleFileRotation(): void {
  if (!LOG_ENABLE_FILE) return
  const check = setInterval(() => {
    const today = kstDateString()
    if (today !== currentFileDate && (currentFileStream || currentCrashStream)) {
      // 새 스트림을 먼저 만든 뒤 old 를 flush + end → 그 사이 write 는 old 로 감.
      // wrapper 에서 currentFileStream / currentCrashStream 을 참조하므로 새 write 는
      // 자동으로 new 로 전환. currentFileDate 는 openFileStream 안에서 갱신.
      const oldMain = currentFileStream
      const oldCrash = currentCrashStream
      currentFileStream = openFileStream()
      currentCrashStream = openCrashFileStream()
      for (const s of [oldMain, oldCrash]) {
        if (!s) continue
        try {
          ;(s as unknown as { flushSync?: () => void }).flushSync?.()
        } catch { /* best effort */ }
        try {
          ;(s as unknown as { end?: () => void }).end?.()
        } catch { /* best effort */ }
      }
    }
  }, 5 * 60 * 1000)
  check.unref()
}

function buildStreams(): pino.StreamEntry[] {
  const streams: pino.StreamEntry[] = [
    { level: LOG_LEVEL as pino.Level, stream: LOG_OUT_STREAM },
  ]

  currentFileStream = openFileStream()
  if (currentFileStream) {
    // Wrapper: currentFileStream 이 rotation 으로 교체돼도 새 stream 을 즉시 참조.
    // write 실패 (rotation race / EPIPE) 는 조용히 삼킴 — 로그 시스템이 서비스에 영향 X.
    streams.push({
      level: LOG_LEVEL as pino.Level,
      stream: {
        write(chunk: string) {
          try {
            currentFileStream?.write(chunk)
          } catch {
            // ignore — 다음 write 에서 새 stream 사용
          }
        },
      } as pino.DestinationStream,
    })

    // Phase 33-C (#418, #409 A): fatal 만 별도로 crash 파일에 tee.
    // pino.multistream 은 entry level 이상만 그 stream 에 씀 → level 'fatal' 이면
    // fatal 이상만 crash 파일. uncaughtException/unhandledRejection 도 logger.fatal
    // 로 기록 (installCrashHandlers 참조) → 자동 포함.
    currentCrashStream = openCrashFileStream()
    if (currentCrashStream) {
      streams.push({
        level: 'fatal',
        stream: {
          write(chunk: string) {
            try {
              currentCrashStream?.write(chunk)
            } catch {
              // ignore — 다음 write 에서 새 stream 사용
            }
          },
        } as pino.DestinationStream,
      })
    }
  }

  return streams
}

export const logger = pino(
  {
    base: { pid: process.pid, service: 'mcp' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
    // Sensitive path — MCP 도구는 대부분 내부용이라 실제 노출 위험은 낮지만 defensive.
    // 최상위 args.* 및 중첩 *.password 형태 모두 커버.
    redact: {
      paths: [
        'args.password', 'args.token', 'args.secret', 'args.apiKey',
        '*.password', '*.token', '*.secret', '*.apiKey', '*.jwt',
        'args.body.password', 'args.body.token',
        'DATABASE_URL', 'TELEGRAM_BOT_TOKEN',
      ],
      censor: '[REDACTED]',
      remove: false,
    },
    level: LOG_LEVEL,
  },
  pino.multistream(buildStreams()),
)

export function newTraceId(): string {
  return randomUUID().slice(0, 8)
}

// Sensitive 키워드 — `_` / `-` 무시 대소문자 무관 매치 (예: userPassword, api_key, jwtToken).
// `'auth'` 는 author* / authoredAt 같은 도메인 필드까지 잡을 수 있어 명시 패턴만 열거.
const SENSITIVE_KEY_PATTERNS = [
  'password', 'token', 'secret', 'apikey', 'jwt', 'credential',
  'authorization', 'authheader', 'authtoken', 'accesstoken', 'refreshtoken', 'bearer',
]

/**
 * args 오브젝트를 deep-copy 하며 sensitive 필드를 [REDACTED] 로 치환.
 * pino redact 는 최상위 로그 프로퍼티에만 작동 (preview 문자열 내부는 못 봄) → serialize
 * 전에 여기서 처리해야 안전.
 *
 * 특수 타입 (Date/Buffer/Error) 은 prototype 손실 방지를 위해 요약 문자열로 반환.
 * Plain object 로 재조립하면 정보 소실.
 */
function redactSensitive(v: unknown, depth = 0): unknown {
  if (depth > 8 || v === null || v === undefined) return v
  if (typeof v !== 'object') return v
  // 특수 타입 가드 (Object.entries 로 재조립하면 prototype 손실)
  if (v instanceof Date) return v.toISOString()
  if (Buffer.isBuffer(v)) return `[Buffer len=${v.length}]`
  if (v instanceof Error) return { name: v.name, message: v.message }
  if (v instanceof Map || v instanceof Set) return `[${v.constructor.name} size=${(v as { size: number }).size}]`
  if (Array.isArray(v)) return v.map((item) => redactSensitive(item, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    // `_` / `-` 무시 대소문자 무관 매치 (예: API_KEY, api-key, APIKEY 모두 apikey 로 정규화)
    const normalized = k.toLowerCase().replace(/[_-]/g, '')
    if (SENSITIVE_KEY_PATTERNS.some((p) => normalized.includes(p))) {
      out[k] = '[REDACTED]'
    } else {
      out[k] = redactSensitive(val, depth + 1)
    }
  }
  return out
}

/**
 * Sensitive 필드 제외한 args summary (긴 문자열 truncate).
 * serialize 전 redact 로 preview 에도 secret 노출 방지.
 */
export function summarizeArgs(args: unknown, maxLen = 200): unknown {
  if (args === null || args === undefined) return args
  const cleaned = redactSensitive(args)
  try {
    const s = JSON.stringify(cleaned)
    if (s.length <= maxLen) return cleaned
    return { _truncated: true, preview: s.slice(0, maxLen) }
  } catch {
    return { _unserializable: true, type: typeof args }
  }
}

/**
 * 파일 스트림에 buffered write flush. pino.multistream 은 flush 를 no-op 로 두므로
 * currentFileStream (sonic-boom) 의 flushSync 를 직접 호출.
 */
function flushAll(): void {
  for (const s of [currentFileStream, currentCrashStream]) {
    try {
      ;(s as unknown as { flushSync?: () => void })?.flushSync?.()
    } catch { /* best effort */ }
  }
}

/**
 * 프로세스 크래시 핸들러 — uncaughtException / unhandledRejection 을 로그로 강제 기록.
 * PM2 auto-restart 와 별개로 로그에 stack 이 남아 사후 분석 가능.
 * 부수 효과로 rotation 스케줄러도 시작. 다중 호출은 handler 중복 등록 위험 → 가드.
 */
let crashHandlersInstalled = false
export function installCrashHandlers(): void {
  if (crashHandlersInstalled) return
  crashHandlersInstalled = true

  process.on('uncaughtException', (err) => {
    logger.fatal(
      { err: { message: err.message, stack: err.stack, name: err.name } },
      'uncaught_exception',
    )
    flushAll()
    // 부팅 초입 (server.listen 이전) 크래시는 이벤트 루프 유지 없이 unref 된 timer 를
    // 건너뛰어 process 가 exit 0 로 자연 종료 → PM2 가 실패로 인지 못 함. unref 제거하고
    // sync flush 후에도 timer 콜백 확실히 실행되도록 유지.
    setTimeout(() => process.exit(1), 100)
  })
  process.on('unhandledRejection', (reason) => {
    logger.fatal(
      {
        err:
          reason instanceof Error
            ? { message: reason.message, stack: reason.stack, name: reason.name }
            : { message: String(reason) },
      },
      'unhandled_rejection',
    )
    flushAll()
    // Node v15+ 는 unhandled rejection 시 프로세스 자동 종료지만 --unhandled-rejections
    // flag 로 warn 모드일 수 있어 방어적으로 exit. unref 하면 initial crash 에서
    // event loop 유지 없이 skip → process exit 0. unref 없이 유지.
    setTimeout(() => process.exit(1), 100)
  })

  scheduleFileRotation()
}
