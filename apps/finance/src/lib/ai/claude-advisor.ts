import { spawn } from 'child_process'
import path from 'path'
import { SYSTEM_PROMPT } from './system-prompt'
import { getGlobalAdvisorMonitor } from './advisor-monitor'

export type AdvisorModel = 'haiku' | 'sonnet'

/**
 * 호출 의도 — 모델 자동 선택 근거 (Phase 35-A / #433).
 *   - `conversation`: `/ai` 자유 질문. 도구 체이닝·트레이드오프 서술 필요 → sonnet
 *   - `parse`: 사용자 자연어 → 구조 JSON (거래·가계부·전략). 짧고 결정적 → haiku
 *   - `guide`: 짧은 TA 조언 등 1~2줄 가이드 → haiku
 *
 * 명시 `model` 이 있으면 그 값이 우선. intent 는 폴백 선택.
 */
export type AdvisorIntent = 'conversation' | 'parse' | 'guide'

/**
 * Pure — intent → model 매핑. 명시 model 이 있으면 그대로, 없으면 intent 로 결정.
 * intent 도 없으면 haiku (하위호환 — 기존 호출부 default).
 */
export function pickModel(model: AdvisorModel | undefined, intent: AdvisorIntent | undefined): AdvisorModel {
  if (model) return model
  if (intent === 'conversation') return 'sonnet'
  // 'parse' / 'guide' / undefined 는 모두 haiku
  return 'haiku'
}

export interface AdvisorOptions {
  /** 모델 선택 (명시 시 intent 무시하고 이 값 사용) */
  model?: AdvisorModel
  /** 호출 의도 — 모델 자동 선택 근거. 명시 model 이 없을 때 폴백 매핑. */
  intent?: AdvisorIntent
  /** 타임아웃 ms (기본: 180_000) */
  timeout?: number
  /** API 비용 상한 USD (기본: 0.50) */
  maxBudgetUsd?: number
  /** 기존 세션 이어가기 */
  sessionId?: string
  /** 세션을 디스크에 저장 (기본: false). 텔레그램 AI만 true */
  persist?: boolean
  /**
   * Phase 40-A (#468) — 호출 위치 라벨. 실패 시 관리자 alert 에 caller 표시로
   * 어느 flow 가 실패했는지 즉시 파악 가능 (briefing / ta-signal / active-review / etc).
   */
  caller?: string
}

export interface AdvisorResult {
  response: string
  model: AdvisorModel
  durationMs: number
  costUsd: number
  sessionId: string
}

/**
 * Phase 40-B (#469) — AdvisorError 원인 분류.
 * 사용자 UX 를 위해 fallback 메시지를 code 별로 분기.
 * - `auth_expired`: Claude CLI 인증 만료 (stderr `not logged in` · `unauthorized` · `credentials` 등)
 * - `quota_exceeded`: MAX 플랜 쿼터 초과 (`quota` · `rate limit` · `usage limit`)
 * - `server_down`: MCP 서버 접근 실패 or spawn 실패 (`ECONNREFUSED` · `MCP` + `connect`)
 * - `timeout`: 별도 `AdvisorTimeoutError` 로 이미 분리되어 있으나 monitor 관점에서 code 통일
 * - `parse_error`: subprocess 는 성공했지만 응답 JSON 파싱 실패
 * - `unknown`: 위 어느 패턴에도 매칭 안 됨
 */
export type AdvisorErrorCode =
  | 'auth_expired'
  | 'quota_exceeded'
  | 'server_down'
  | 'timeout'
  | 'parse_error'
  | 'unknown'

export class AdvisorTimeoutError extends Error {
  code: AdvisorErrorCode = 'timeout'
  constructor(timeoutMs: number) {
    super(`AI 응답 시간이 초과되었습니다. (${timeoutMs / 1000}초)`)
    this.name = 'AdvisorTimeoutError'
  }
}

export class AdvisorError extends Error {
  /** 디버깅용 상세 (예: claude CLI stderr tail). 사용자 노출 금지. */
  detail?: string
  /** Phase 40-B (#469) — 원인 분류. 미지정 시 unknown. */
  code: AdvisorErrorCode
  constructor(message: string, detail?: string, code: AdvisorErrorCode = 'unknown') {
    super(message)
    this.name = 'AdvisorError'
    this.detail = detail
    this.code = code
  }
}

/**
 * Phase 40-B (#469) — stderr tail 을 pattern matching 해 error code 결정.
 * pure — 판정 규칙만 담아 test 용이. subprocess 성공/spawn 실패는 caller 에서
 * 직접 code 지정 (예: `AdvisorError('...', undefined, 'server_down')`).
 */
/**
 * Codex #479 P2 재수정: bare `'401'` / `'403'` / `'429'` substring 매칭은
 * false positive 유발 (port 4030 · 라인 401 · request id 포함 등). Claude 가
 * 실제 뱉는 형태만 명시적으로 매칭 (regex):
 *   - `api_error_status=401` (extractAdvisorErrorText 조립 형식)
 *   - `HTTP 401` / `HTTP/1.1 401` (curl-style)
 *   - `status: 401` (JSON stringify or log format)
 *   - `401 Unauthorized` / `403 Forbidden` (HTTP standard reason)
 */
// Codex #479 P2 (3차): `HTTP/1.1 401` 처럼 protocol version 이 사이에 있는
// curl-style 도 매칭 지원 — `http` (optional `/N.N` version) + 공백/slash + status.
const AUTH_STATUS_PATTERNS: RegExp[] = [
  /api_error_status[=:]\s*(?:401|403)\b/i,
  /\bhttp(?:\/[\d.]+)?[\s/]+(?:401|403)\b/i,
  /\bstatus[:\s]+(?:401|403)\b/i,
  /\b(?:401|403)\s+(?:unauthorized|forbidden)\b/i,
]
const QUOTA_STATUS_PATTERNS: RegExp[] = [
  /api_error_status[=:]\s*429\b/i,
  /\bhttp(?:\/[\d.]+)?[\s/]+429\b/i,
  /\bstatus[:\s]+429\b/i,
  /\b429\s+(?:too\s+many\s+requests|rate\s+limit)\b/i,
]

export function classifyAdvisorError(stderr: string | undefined): AdvisorErrorCode {
  if (!stderr) return 'unknown'
  const s = stderr.toLowerCase()
  // 인증 만료 계열 — claude CLI 가 auth 실패 시 뱉는 문구들.
  if (
    s.includes('not logged in') ||
    s.includes('unauthorized') ||
    s.includes('credentials') ||
    s.includes('please login') ||
    s.includes('session expired') ||
    s.includes('authentication') ||
    AUTH_STATUS_PATTERNS.some((re) => re.test(stderr))
  ) return 'auth_expired'
  // 쿼터 초과 — MAX 플랜 usage limit
  if (
    s.includes('quota') ||
    s.includes('rate limit') ||
    s.includes('usage limit') ||
    s.includes('too many requests') ||
    QUOTA_STATUS_PATTERNS.some((re) => re.test(stderr))
  ) return 'quota_exceeded'
  // MCP 서버 접근 실패
  if (
    s.includes('econnrefused') ||
    s.includes('connection refused') ||
    (s.includes('mcp') && (s.includes('connect') || s.includes('timeout'))) ||
    s.includes('server not responding')
  ) return 'server_down'
  return 'unknown'
}

/**
 * Phase 40-B (#469) — code → 사용자에게 표시할 한국어 fallback 메시지.
 * pure — caller (봇/웹) 는 이 결과를 그대로 사용자에게 노출 (stderr detail 유출 없음).
 */
export function describeAdvisorError(err: AdvisorError | AdvisorTimeoutError | Error): string {
  const code: AdvisorErrorCode =
    err instanceof AdvisorError || err instanceof AdvisorTimeoutError ? err.code : 'unknown'
  switch (code) {
    case 'auth_expired':
      return '🤖 AI 어드바이저 인증 갱신 필요 — 관리자에게 문의해주세요.'
    case 'quota_exceeded':
      return '🤖 AI 어드바이저 사용량 초과 — 관리자에게 문의해주세요. 잠시 후 다시 시도해보세요.'
    case 'server_down':
      return '🤖 AI 어드바이저 서버 접근 실패 — 관리자에게 문의해주세요.'
    case 'timeout':
      return '⏱ AI 응답 시간 초과 — 잠시 후 다시 시도해주세요.'
    case 'parse_error':
      return '🤖 AI 응답을 처리할 수 없습니다 — 잠시 후 다시 시도해주세요.'
    default:
      return '🤖 AI 어드바이저 일시 중단 — 관리자에게 문의해주세요.'
  }
}

/** 허용된 MCP 읽기 전용 도구 목록 */
const ALLOWED_TOOLS = [
  'mcp__myfinance__get_portfolio',
  'mcp__myfinance__get_trades',
  'mcp__myfinance__get_performance',
  'mcp__myfinance__get_gift_tax_status',
  'mcp__myfinance__get_dividends',
  'mcp__myfinance__get_spending_summary',
  'mcp__myfinance__simulate_growth',
  'mcp__myfinance__get_prices',
  'mcp__myfinance__get_fx_rate',
  'mcp__myfinance__get_technical_analysis',
  'mcp__myfinance__get_holding_strategy',
  'mcp__myfinance__get_all_strategies',
  'mcp__myfinance__set_holding_strategy',
  'mcp__myfinance__get_networth',
  'mcp__myfinance__get_rsu_schedule',
  'mcp__myfinance__get_stock_options',
  'mcp__myfinance__get_watchlist',
  'mcp__myfinance__add_watchlist',
  'mcp__myfinance__update_watchlist',
  'mcp__myfinance__delete_watchlist',
  'mcp__myfinance__get_transactions',
  'mcp__myfinance__create_transaction',
  'mcp__myfinance__update_transaction',
  'mcp__myfinance__delete_transaction',
  'mcp__myfinance__create_category',
  'mcp__myfinance__update_category',
  'mcp__myfinance__delete_category',
  'mcp__myfinance__list_assets',
  'mcp__myfinance__create_asset',
  'mcp__myfinance__update_asset',
  'mcp__myfinance__delete_asset',
  'mcp__myfinance__create_asset_deposit',
  'mcp__myfinance__list_budgets',
  'mcp__myfinance__set_budget',
  'mcp__myfinance__delete_budget',
  'mcp__myfinance__list_recurring_transactions',
  'mcp__myfinance__create_recurring_transaction',
  'mcp__myfinance__update_recurring_transaction',
  'mcp__myfinance__delete_recurring_transaction',
  'mcp__myfinance__list_alert_configs',
  'mcp__myfinance__update_alert_config',
  'mcp__myfinance__list_alert_history',
  'mcp__myfinance__create_rsu_schedule',
  'mcp__myfinance__update_rsu_schedule',
  'mcp__myfinance__delete_rsu_schedule',
  'mcp__myfinance__vest_rsu',
  'mcp__myfinance__create_stock_option',
  'mcp__myfinance__update_stock_option',
  'mcp__myfinance__delete_stock_option',
  'mcp__myfinance__create_stock_option_vesting',
  'mcp__myfinance__update_stock_option_vesting',
  'mcp__myfinance__delete_stock_option_vesting',
  'mcp__myfinance__exercise_vesting',
  'mcp__myfinance__create_custom_strategy',
  'mcp__myfinance__list_custom_strategies',
  'mcp__myfinance__update_custom_strategy',
  'mcp__myfinance__delete_custom_strategy',
  'WebSearch',
  'WebFetch',
].join(',')

interface ClaudeJsonOutput {
  is_error: boolean
  result: string
  duration_ms: number
  total_cost_usd: number
  session_id: string
  // Codex #479 P2: Claude ResultMessage 는 최종 API 실패 시 `result` 는 비고
  // `api_error_status` 에 HTTP status (예: 429 rate limit) 를 담을 수 있음.
  // classify 시 이 필드도 참조해야 auth/quota 분류 가능.
  api_error_status?: number | string
  errors?: unknown
}

/**
 * Codex #479 P2: Claude JSON output 에서 classify 대상 문자열을 조립.
 * result 뿐 아니라 `api_error_status` (예: `429`) 와 `errors` 필드까지 포함해
 * `result` 가 비어있어도 auth/quota 분류가 가능하도록. pure — 테스트 용이.
 */
export function extractAdvisorErrorText(json: Partial<ClaudeJsonOutput>): string {
  const parts: string[] = []
  if (typeof json.result === 'string' && json.result) parts.push(json.result)
  if (json.api_error_status != null) parts.push(`api_error_status=${json.api_error_status}`)
  if (json.errors != null) {
    try {
      parts.push(typeof json.errors === 'string' ? json.errors : JSON.stringify(json.errors))
    } catch { /* ignore stringify failure */ }
  }
  return parts.join('\n')
}

/**
 * 문자열을 shell 인자로 안전하게 이스케이프
 */
function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

/**
 * Claude Code CLI를 subprocess로 호출하여 AI 어드바이저 응답을 생성한다.
 *
 * shell 경유 실행 (spawn with shell: true)으로
 * 긴 시스템 프롬프트와 빈 문자열 인자를 안전하게 전달.
 */
export async function askAdvisor(
  prompt: string,
  options: AdvisorOptions = {}
): Promise<AdvisorResult> {
  const {
    timeout = 180_000,
    maxBudgetUsd = 0.50,
    sessionId,
    persist = false,
  } = options
  // Phase 35-A (#433): intent → model 폴백 매핑. 명시 model 우선.
  const model = pickModel(options.model, options.intent)

  // 프롬프트 길이 제한
  const MAX_PROMPT_LENGTH = 10_000
  if (!prompt || prompt.trim().length === 0) {
    throw new AdvisorError('질문을 입력해주세요.')
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new AdvisorError(`질문이 너무 깁니다. (최대 ${MAX_PROMPT_LENGTH}자)`)
  }

  // 입력 검증
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new AdvisorError('timeout은 양수여야 합니다.')
  }
  if (!Number.isFinite(maxBudgetUsd) || maxBudgetUsd <= 0) {
    throw new AdvisorError('maxBudgetUsd는 양수여야 합니다.')
  }

  const projectRoot = process.env.MYFINANCE_ROOT ?? process.cwd()
  const mcpConfigPath = process.env.MCP_CONFIG_PATH
    ?? path.join(projectRoot, 'src/lib/ai/mcp-config.json')

  const cmdParts = [
    'claude',
    '-p', shellEscape(prompt),
    '--output-format', 'json',
    '--model', model,
  ]

  if (sessionId) {
    // 세션 이어가기: --resume 사용, system-prompt는 이미 세션에 포함
    cmdParts.push('--resume', shellEscape(sessionId))
  } else {
    // 새 세션: system-prompt 포함
    cmdParts.push('--system-prompt', shellEscape(SYSTEM_PROMPT))
  }

  cmdParts.push(
    '--mcp-config', shellEscape(mcpConfigPath),
    '--strict-mcp-config',
    '--allowedTools', shellEscape(ALLOWED_TOOLS),
    '--tools', '"WebSearch,WebFetch"',
    '--max-budget-usd', String(maxBudgetUsd),
    '--permission-mode', 'dontAsk',
  )

  // 세션 저장: persist=true인 경우만 저장, 그 외 비저장
  if (!persist) {
    cmdParts.push('--no-session-persistence')
  }

  const cmd = cmdParts.join(' ')

  const subprocessPromise = new Promise<AdvisorResult>((resolve, reject) => {
    const chunks: Buffer[] = []
    /** stderr 최대 보유량 — buffer full → child hang 방지 + 로그 폭증 차단.
     *  rolling buffer 로 항상 **마지막** STDERR_MAX_BYTES 만 유지 (앞 chunk drop).
     *  claude/npx 가 verbose 출력 뒤에 진짜 에러를 마지막에 찍는 경우를 위해 tail 보존이 핵심. */
    const STDERR_MAX_BYTES = 64 * 1024
    let errBuf: Buffer = Buffer.alloc(0)
    let timedOut = false

    const child = spawn('sh', ['-c', cmd], {
      cwd: projectRoot,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeout)

    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => {
      errBuf = Buffer.concat([errBuf, chunk])
      if (errBuf.length > STDERR_MAX_BYTES) {
        errBuf = errBuf.subarray(errBuf.length - STDERR_MAX_BYTES)
      }
    })

    child.on('close', (code) => {
      clearTimeout(timer)

      if (timedOut) {
        reject(new AdvisorTimeoutError(timeout))
        return
      }

      const stdout = Buffer.concat(chunks).toString('utf-8')
      const stderr = errBuf.toString('utf-8').trim()

      if (code !== 0) {
        // Codex #478 P2: `--output-format json` 은 에러도 stdout JSON 으로 반환 후
        // exit code 를 non-zero 로 종료. stdout 파싱 없이 stderr 만 보면 대부분
        // 비어있어 unknown 처리 → fallback UX 오분류. stdout JSON 우선 시도.
        const stderrTail = stderr.slice(-1024)
        if (stderrTail) console.error('[advisor] claude stderr:', stderrTail)
        // stdout JSON 에서 error 문구 추출 시도. 실패해도 stderr fallback.
        // Codex #479 P2: `result` 뿐 아니라 `api_error_status` (예: 429) · `errors`
        // 필드까지 결합 — Claude 는 rate limit/최종 실패 시 result 비고 status 만 채움.
        let jsonErrorText = ''
        try {
          const parsed = JSON.parse(stdout) as Partial<ClaudeJsonOutput>
          if (parsed && typeof parsed === 'object') {
            jsonErrorText = extractAdvisorErrorText(parsed)
          }
        } catch {
          // stdout 이 JSON 아니거나 partial — stderr 만 사용
        }
        // classifyAdvisorError 는 stdout error 텍스트 + stderr 을 함께 검사 →
        // JSON result 에 담긴 auth/quota 문구도 정확히 분류.
        const combined = [jsonErrorText, stderrTail].filter(Boolean).join('\n')
        const errorCode = classifyAdvisorError(combined || undefined)
        // detail 은 사용자 진단 정보 우선순위: stdout JSON 문구 > stderr tail.
        // 관리자 alert 에도 이게 더 actionable (Claude 자체의 에러 원문).
        const detail = jsonErrorText.slice(0, 1024) || stderrTail || undefined
        reject(new AdvisorError(`Claude CLI 종료 코드: ${code}`, detail, errorCode))
        return
      }

      try {
        const output: ClaudeJsonOutput = JSON.parse(stdout)

        if (output.is_error) {
          // Codex #478 P2: exit code 0 인데 is_error=true 인 케이스도 classify.
          // Codex #479 P2: `result` 가 비어있어도 `api_error_status` / `errors`
          // 활용해 auth/quota 정확 분류.
          const errorText = extractAdvisorErrorText(output)
          const errorCode = classifyAdvisorError(errorText || undefined)
          reject(new AdvisorError(
            `AI 응답 오류: ${output.result || `api_error_status=${output.api_error_status ?? 'unknown'}`}`,
            errorText.slice(0, 1024) || undefined,
            errorCode,
          ))
          return
        }

        resolve({
          response: output.result,
          model,
          durationMs: output.duration_ms,
          costUsd: output.total_cost_usd,
          sessionId: output.session_id ?? '',
        })
      } catch {
        reject(new AdvisorError('AI 응답을 파싱할 수 없습니다.', undefined, 'parse_error'))
      }
    })

    child.on('error', (error) => {
      clearTimeout(timer)
      // Phase 40-B: spawn 실패 (ENOENT / EACCES 등) 는 서버 계열 → server_down
      reject(new AdvisorError(`Claude CLI 실행 오류: ${error.message}`, undefined, 'server_down'))
    })
  })

  // Phase 40-A (#468) — 실패/성공을 monitor 에 기록 → 연속 3회 실패 시 관리자
  // 텔레그램 alert 자동 발송. resolve/reject 결과에 side-effect 만 추가하고 원본
  // promise 를 그대로 리턴 (호출자 관점 동작 무변경).
  // `void ...` 로 명시적 fire-and-forget — hook 실패는 caller 로 전파되지 않고
  // console.error 로만 남김 (모니터 실패가 원본 응답을 오염 안 시킴).
  void subprocessPromise.then(
    () => {
      getGlobalAdvisorMonitor().recordSuccess().catch((e) => {
        console.error('[advisor] monitor.recordSuccess 실패:', e)
      })
    },
    (err: unknown) => {
      // 실패 계열만 monitor 에 기록 (Error 인스턴스). unknown 은 무시.
      if (err instanceof Error) {
        getGlobalAdvisorMonitor().recordFailure(err, options.caller).catch((e) => {
          console.error('[advisor] monitor.recordFailure 실패:', e)
        })
      }
    },
  )

  return subprocessPromise
}
