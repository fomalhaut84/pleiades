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
  /**
   * #483 — 호출부가 MCP 도구 사용을 필수로 기대하는 flow (예: 모닝 브리핑).
   * true 이면 Claude JSON output `num_turns` 이 2 미만 (도구 미호출) 인 응답을
   * `no_tool_used` 로 실패 처리 → caller 는 fallback + monitor alert 트리거.
   *
   * **왜 필요:** Claude 가 `--strict-mcp-config` + tools/list 정상 수신에도
   * 간헐적으로 도구를 한 번도 호출하지 않고 "도구 접근 불가" 안내 텍스트만
   * 리턴하는 케이스 발생. `is_error=false` 이므로 CLI 성공 응답으로 판정되어
   * 그대로 사용자에게 발송됨. num_turns 기반 검증으로 감지.
   */
  expectsTools?: boolean
  /**
   * #486 — `no_tool_used` 실패 시 자동 재시도 횟수 (기본 0 = 재시도 안 함).
   *
   * v0.16.2 (#483) 는 감지 + fallback 만 도입. 실운영에서 자동 브리핑이 매번
   * fallback 되는 문제 관찰 (2026-08-19). 원인은 Claude CLI/모델 판단 쪽이라
   * 우리가 직접 fix 불가 — 재시도로 대부분 해결 (수동 재시도 시 정상 브리핑).
   *
   * **정책:**
   *   - `no_tool_used` 만 재시도 (auth_expired/quota_exceeded/timeout 등은
   *     즉시 fallback, 재시도 무의미)
   *   - 각 재시도 사이 `RETRY_BACKOFF_MS` 만큼 sleep (기본 90초 — Claude 재
   *     판단 리셋 여유, MCP 30분 TTL 미달, rate limit 부담 낮음)
   *   - 재시도 시 프롬프트에 "이전 시도에서 도구를 호출하지 않았습니다..." hint
   *     prepend 로 성공률 개선 (`augmentRetryPrompt` 참고)
   *   - 각 실패는 advisor-monitor 에 여전히 카운트 → 6회 모두 실패면 3회
   *     임계 훌쩍 넘어 관리자 alert 자동 발동
   *   - `expectsTools: true` 와 함께 써야 의미 있음 (그 옵션 없이는 no_tool_used
   *     자체가 발생 안 함)
   *
   * **시간 예산 (실측):** 실패 subprocess ~26초, 성공 1~3분. 5회 재시도 (총 6회
   * 시도) + 90초 backoff → 모두 실패 ~10분, 마지막 성공 ~13분. 15분 예산 안.
   *
   * ⚠️ **`maxBudgetUsd` 는 total cap** (Codex PR #487 P1): 재시도가 도입되면
   * 개별 subprocess 마다 원본 예산을 그대로 쓰던 옛 동작은 총 지출을 6배로
   * 만들 위험. retry loop 이 costSpent 를 누적하고 남은 예산만 다음 시도로 전달.
   * `overallTimeoutMs` 도 함께 지정하지 않으면 각 시도가 개별 `timeout` 만큼
   * 걸릴 수 있어 총 시간이 문서화된 예산을 초과할 수 있음.
   */
  retryOnNoToolUsed?: number
  /**
   * Codex PR #487 P2 — retry loop 전체의 end-to-end deadline (ms).
   *
   * 미지정이면 각 subprocess 가 개별 `timeout` 만큼 걸릴 수 있어 (subprocess 6회
   * + backoff 5회) 문서화된 시간 예산을 초과. 이 옵션을 지정하면 loop 이 elapsed
   * 를 추적해 각 attempt timeout 을 `min(timeout, remaining_deadline)` 으로
   * 축소하고, 다음 backoff sleep 이 deadline 을 넘길 것으로 예상되면 재시도를
   * 조기 중단하고 `AdvisorTimeoutError` 를 throw.
   *
   * caller 권장 세팅: 15분 예산 = `900_000` (retry × 5 + 90s backoff × 5 커버).
   */
  overallTimeoutMs?: number
}

/** #486 — 재시도 간 backoff (ms). Claude 재판단 리셋 + rate limit 여유. */
export const RETRY_BACKOFF_MS = 90_000

/**
 * Codex PR #487 P2 (5차) — retryOnNoToolUsed 실용적 상한.
 * Number.isSafeInteger(MAX_SAFE_INTEGER)=true 지만 `+1` 하면 unsafe 로 넘어가
 * `attempt++` 가 stall 하고 loop 조건이 영원히 참. 실무적으로 caller 는 <10 회
 * (현재 모두 5), 90초 backoff × 100회 = 2.5시간 이상이라 사실상 무한. 100 이면
 * 어떤 정당한 caller 도 커버하고 safe integer 범위 안.
 */
export const RETRY_MAX_CAP = 100

/**
 * Pure — 재시도 대상 판정. `no_tool_used` 만 재시도 의미 있음.
 * auth/quota/timeout/parse 등은 재시도해도 결과 안 바뀌므로 즉시 fallback.
 */
export function shouldRetryError(err: unknown): boolean {
  if (!(err instanceof AdvisorError)) return false
  return err.code === 'no_tool_used'
}

/**
 * Pure — 재시도 시 프롬프트 앞에 hint prepend. attempt 는 1-based 시도 번호
 * (1 = 첫 시도, 2 = 첫 재시도, ...). attempt <= 1 이면 원본 그대로.
 *
 * hint 는 "이번엔 반드시 MCP 도구부터 호출해라" 를 명확히 지시해 Claude 판단
 * 편향을 재시도 프롬프트로 correct. augmentation 없이 그냥 재시도해도 재시도
 * 자체가 새 세션이라 성공률 높지만 hint 로 추가 개선.
 */
export function augmentRetryPrompt(originalPrompt: string, attempt: number): string {
  if (attempt <= 1) return originalPrompt
  return (
    `⚠️ [재시도 ${attempt - 1}회차] 이전 시도에서 데이터 도구 (mcp__myfinance__*) 를 ` +
    `한 번도 호출하지 않았습니다. 반드시 필요한 MCP 도구부터 먼저 호출한 뒤 응답을 ` +
    `작성해주세요. WebSearch 만으로는 불충분합니다.\n\n---\n\n${originalPrompt}`
  )
}

/** #486 — 재시도 loop 용 sleep. 테스트에서 timer mock 가능. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface AdvisorResult {
  response: string
  model: AdvisorModel
  durationMs: number
  costUsd: number
  sessionId: string
  /**
   * #483 — Claude 대화 turn 수. tool 호출이 있으면 최소 2 (assistant → tool → assistant),
   * 없으면 1. `expectsTools` 검증에 사용. `--output-format json` 에 없거나 파싱 실패
   * 케이스는 0.
   */
  numTurns: number
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
  /**
   * #483 — Claude 가 MCP 도구를 한 번도 호출하지 않고 응답 종료 (mcp_attempts=0).
   * caller 가 `expectsTools: true` 로 opt-in 했을 때만 발생. CLI subprocess 자체는
   * exit 0 + is_error=false 라 별도 판정 필요.
   *
   * **재시도 대상** — Claude 판단 flaky 성이라 재시도로 대부분 해결.
   */
  | 'no_tool_used'
  /**
   * Codex PR #487 P2 (5차) — Claude 가 MCP 도구를 시도했으나 tool_result 가
   * 모두 `is_error=true` 로 실패 (예: MCP 서버 down, tool arg validation 실패,
   * tool 내부 예외). deterministic 실패라 재시도 무의미 — 즉시 fallback.
   */
  | 'mcp_call_failed'
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
  /**
   * Codex PR #487 P1 (2차) — subprocess 가 성공적으로 result event 를 발행한
   * 뒤 우리가 evaluator 로 실패 재분류한 경우 (예: `no_tool_used`, `is_error=true`,
   * exit code != 0 with parseable output), Claude 가 실제로 사용한 API 비용.
   * retry loop 이 costSpent 에 누적해 total cost cap 을 정확히 강제.
   * subprocess 자체가 파싱 실패/timeout/spawn 실패한 경우는 undefined.
   */
  costUsd?: number
  constructor(
    message: string,
    detail?: string,
    code: AdvisorErrorCode = 'unknown',
    costUsd?: number,
  ) {
    super(message)
    this.name = 'AdvisorError'
    this.detail = detail
    this.code = code
    this.costUsd = costUsd
  }
}

/**
 * Phase 40-B (#469) — stderr tail 을 pattern matching 해 error code 결정.
 * pure — 판정 규칙만 담아 test 용이. subprocess 성공/spawn 실패는 caller 에서
 * 직접 code 지정 (예: `AdvisorError('...', undefined, 'server_down')`).
 */
/**
 * Codex PR #484 P1 (3차 지적): num_turns 도, 응답 텍스트 fingerprint 도 MCP
 * tool 실제 호출 여부의 정확한 evaluator 가 아님.
 *   - `num_turns >= 2` 는 WebSearch 만 호출한 경우에도 성립 → 통과되면 데이터
 *     없는 브리핑 발송.
 *   - 응답 텍스트에 "도구 접근 불가" 안내가 없어도 (Claude 가 plausible 하지만
 *     데이터 없는 report 를 만들면) fingerprint 매칭 실패 → 통과.
 *
 * 유일한 정답: **실제 호출된 tool 이름 목록** 을 확인.
 * `--output-format stream-json --verbose` 는 각 assistant event 의
 * `message.content[]` 배열에 `type: 'tool_use'` + `name` 을 담음 → 파싱해서
 * `mcp__myfinance__*` prefix 카운트가 evaluator.
 *
 * `hasNoToolResponse` fingerprint 는 belt-and-suspenders 로 유지 — MCP tool
 * 을 호출했더라도 응답 본문에 "도구 접근 불가" 를 쓰면 여전히 사용자에게
 * 유해 (일부 tool 실패 시 Claude 가 이런 문구를 섞을 수 있음). 정상 응답이
 * 이 pattern 을 언급할 이유는 없어 false positive 낮음.
 */
const NO_TOOL_RESPONSE_PATTERNS: RegExp[] = [
  /(데이터\s*)?도구.{0,20}연결되지\s*않/,
  /(도구|MCP).{0,20}(연결|접근)\s*(문제|불가|실패)/,
  /(도구|MCP)\s*(연결|접근).{0,10}(못|안|불가)\s*(했|합|됩)/,
]

/**
 * Pure — 응답 텍스트에서 "도구 미사용" fingerprint 감지 (belt-and-suspenders).
 * 정확한 evaluator 는 `countMcpMyFinanceCalls` — 이건 보조 검증.
 */
export function hasNoToolResponse(text: string | undefined): boolean {
  if (!text) return false
  return NO_TOOL_RESPONSE_PATTERNS.some((re) => re.test(text))
}

/**
 * Codex PR #484 P1 (3차/4차) — `--output-format stream-json --verbose` 응답 파싱.
 *
 * 각 라인은 완전한 NDJSON event. 관심 event:
 *   - `type: 'assistant'` — `message.content[]` 배열의 `tool_use` block. `id` + `name`.
 *     시도 자체가 성공을 의미하지는 않음 (매칭되는 tool_result 를 확인해야).
 *   - `type: 'user'` — `message.content[]` 의 `tool_result` block. `tool_use_id` 로
 *     이전 tool_use 와 correlate. `is_error: true` 면 그 호출은 실패 (예: MCP
 *     서버 오류, tool arg validation 실패, tool 내부 예외).
 *   - `type: 'result'` — 마지막 event. `is_error` / `result` / `num_turns` /
 *     `session_id` / `duration_ms` / `total_cost_usd` / `api_error_status` / `errors`.
 *
 * 4차 지적 반영: tool_use 만 카운트하면 tool_result 가 `is_error: true` 라도
 * "호출됨" 으로 판정되어 데이터 없는 응답이 통과. tool_use.id ↔ tool_result.
 * tool_use_id 매칭으로 각 호출의 실제 성공 여부까지 확인.
 *
 * pure — 테스트 용이. malformed line 은 skip.
 */
export interface ParsedToolCall {
  /** Claude 가 부여한 unique id — tool_result 매칭용. 누락 가능 (구버전). */
  id?: string
  /** Tool 이름 (예: `mcp__myfinance__get_portfolio`, `WebSearch`, `Bash`) */
  name: string
  /**
   * 매칭된 tool_result 이벤트가 수신됐는지.
   * false 면 subprocess 이상 종료 (assistant tool_use 만 emit 되고 user
   * tool_result 못 받음) — 이 경우 성공으로 간주하지 않음 (fail-closed).
   */
  hasResult: boolean
  /**
   * 매칭된 tool_result 의 `is_error` 필드 값 (optional).
   *   - `undefined`: 필드가 없음 → **정상 성공** (Anthropic ToolResultBlockParam
   *     스키마상 is_error 는 optional. `src/mcp/utils.ts` 의 성공 응답
   *     `toolResult` 는 이 필드를 생략, 실패 `toolError` 만 `isError: true` 추가)
   *   - `false`: 명시적 성공
   *   - `true`: 명시적 실패 (MCP 오류 · validation · 예외 등)
   */
  isError?: boolean
}

export interface ParsedClaudeStream {
  /** 마지막 result event (기존 ClaudeJsonOutput 과 동일 스키마) */
  finalResult?: ClaudeJsonOutput
  /** 모든 assistant tool_use event (호출 순서대로) + 매칭된 tool_result.is_error */
  toolCalls: ParsedToolCall[]
}

interface ClaudeStreamContentBlock {
  type?: string
  name?: string
  id?: string
  tool_use_id?: string
  is_error?: boolean
}

export function parseClaudeStreamJson(stdout: string): ParsedClaudeStream {
  const toolCalls: ParsedToolCall[] = []
  const byId = new Map<string, ParsedToolCall>()
  let finalResult: ClaudeJsonOutput | undefined
  const lines = stdout.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let evt: unknown
    try {
      evt = JSON.parse(trimmed)
    } catch {
      continue
    }
    if (typeof evt !== 'object' || evt === null) continue
    const type = (evt as { type?: unknown }).type
    if (type === 'assistant') {
      const content = (evt as { message?: { content?: ClaudeStreamContentBlock[] } }).message?.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.type === 'tool_use' && typeof block.name === 'string') {
            const call: ParsedToolCall = {
              id: typeof block.id === 'string' ? block.id : undefined,
              name: block.name,
              hasResult: false,
            }
            toolCalls.push(call)
            if (call.id) byId.set(call.id, call)
          }
        }
      }
    } else if (type === 'user') {
      const content = (evt as { message?: { content?: ClaudeStreamContentBlock[] } }).message?.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (
            block?.type === 'tool_result' &&
            typeof block.tool_use_id === 'string'
          ) {
            const call = byId.get(block.tool_use_id)
            if (call) {
              // Codex PR #484 P1 (5차): result 이벤트 수신 자체는 성공 신호.
              // is_error 는 optional (Anthropic ToolResultBlockParam 스키마) —
              // 성공 응답은 이 필드 생략. 명시적 boolean 만 채우고 없으면
              // undefined 유지, 성공 판정은 countSuccessful* 이 담당.
              call.hasResult = true
              if (typeof block.is_error === 'boolean') {
                call.isError = block.is_error
              }
            }
          }
        }
      }
    } else if (type === 'result') {
      finalResult = evt as ClaudeJsonOutput
    }
  }
  return { finalResult, toolCalls }
}

/** Pure — `mcp__myfinance__*` prefix 시도 카운트 (성공/실패 무관). */
export function countMcpMyFinanceCalls(toolCalls: ParsedToolCall[]): number {
  return toolCalls.filter((c) => c.name.startsWith('mcp__myfinance__')).length
}

/**
 * Pure — `mcp__myfinance__*` 중 **성공** 한 호출 카운트.
 *
 * 성공 판정: `hasResult === true && isError !== true`
 *   - matching tool_result 이벤트를 받았고 (subprocess 이상 종료 아님)
 *   - is_error 가 명시적으로 true 가 아님 (undefined 나 false 모두 성공)
 *
 * Codex PR #484 P1 (5차): is_error 는 Anthropic ToolResultBlockParam 스키마상
 * optional. 성공 응답 (`src/mcp/utils.ts` 의 `toolResult`) 은 이 필드를 생략
 * 하고 실패 (`toolError`) 만 `isError: true` 를 추가. 4차 fix 는 undefined
 * 를 fail-closed 로 다뤘는데 이는 **모든 정상 브리핑을 실패 처리** 하는
 * 문제 발생 → matching result 수신 여부 (`hasResult`) 로 pivot.
 */
export function countSuccessfulMcpMyFinanceCalls(toolCalls: ParsedToolCall[]): number {
  return toolCalls.filter(
    (c) => c.name.startsWith('mcp__myfinance__') && c.hasResult && c.isError !== true,
  ).length
}

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
    case 'no_tool_used':
      return '🤖 AI 어드바이저가 데이터 도구를 호출하지 않았습니다 — 관리자에게 문의해주세요.'
    case 'mcp_call_failed':
      return '🤖 데이터 도구 호출이 실패했습니다 (MCP 서버 오류 가능) — 관리자에게 문의해주세요.'
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
  /**
   * #483 — Claude 대화 turn 수. tool 사용 시 최소 2 (assistant → tool_use →
   * assistant), 미사용 시 1. `expectsTools: true` caller 는 이 값으로 도구
   * 미호출 응답을 감지.
   */
  num_turns?: number
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
 *
 * #486 — `retryOnNoToolUsed` 옵션 시 no_tool_used 실패에 한해 재시도. 각
 * 재시도는 새 subprocess spawn (Claude 세션도 새로 초기화) + prompt hint
 * augmentation + `RETRY_BACKOFF_MS` sleep. auth/quota 등 다른 실패는 즉시
 * throw (재시도 무의미).
 */
export async function askAdvisor(
  prompt: string,
  options: AdvisorOptions = {}
): Promise<AdvisorResult> {
  // 원본 prompt 기준 validation (augmented prompt 는 hint 추가만 하므로 원본
  // 유효하면 augmented 도 유효 — 별도 검증 불필요).
  const MAX_PROMPT_LENGTH = 10_000
  if (!prompt || prompt.trim().length === 0) {
    throw new AdvisorError('질문을 입력해주세요.')
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new AdvisorError(`질문이 너무 깁니다. (최대 ${MAX_PROMPT_LENGTH}자)`)
  }

  const timeout = options.timeout ?? 180_000
  const maxBudgetUsd = options.maxBudgetUsd ?? 0.50
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new AdvisorError('timeout은 양수여야 합니다.')
  }
  if (!Number.isFinite(maxBudgetUsd) || maxBudgetUsd <= 0) {
    throw new AdvisorError('maxBudgetUsd는 양수여야 합니다.')
  }
  const overallTimeoutMs = options.overallTimeoutMs
  if (
    overallTimeoutMs !== undefined &&
    (!Number.isFinite(overallTimeoutMs) || overallTimeoutMs <= 0)
  ) {
    throw new AdvisorError('overallTimeoutMs는 양수여야 합니다.')
  }
  // Codex PR #487 P2 (3차/4차/5차): NaN/Infinity/음수/소수/과다값 모두 방어.
  //   - NaN → Math.floor(NaN)=NaN → for 조건이 항상 false → 첫 시도조차 안 함
  //   - Infinity → overallTimeoutMs 없을 때 무한 loop 위험
  //   - 음수 → 재시도 안 함 이지만 caller 실수 즉시 알리도록 reject
  //   - 소수 → Math.floor 로 조용히 0/1 이 되어 재시도 disabled (계약 위반)
  //   - MAX_SAFE_INTEGER → isSafeInteger 통과지만 +1 하면 unsafe 로 넘어가
  //     attempt++ stall + loop 무한 → RETRY_MAX_CAP (100) 로 실용적 상한.
  if (
    options.retryOnNoToolUsed !== undefined &&
    (!Number.isSafeInteger(options.retryOnNoToolUsed) ||
      options.retryOnNoToolUsed < 0 ||
      options.retryOnNoToolUsed > RETRY_MAX_CAP)
  ) {
    throw new AdvisorError(
      `retryOnNoToolUsed는 0~${RETRY_MAX_CAP} 사이의 안전한 정수여야 합니다.`,
    )
  }

  const maxRetries = options.retryOnNoToolUsed ?? 0
  const startedAt = Date.now()
  let costSpent = 0
  let lastError: unknown
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    // Codex #487 P2: overall deadline 체크. remaining <= 0 이면 즉시 timeout.
    const elapsed = Date.now() - startedAt
    const remainingDeadline =
      overallTimeoutMs !== undefined ? overallTimeoutMs - elapsed : Infinity
    if (remainingDeadline <= 0) {
      throw new AdvisorTimeoutError(overallTimeoutMs ?? timeout)
    }
    // Codex #487 P1: 총 예산 cap. 남은 예산이 없으면 재시도 중단.
    const remainingBudget = maxBudgetUsd - costSpent
    if (remainingBudget <= 0) {
      throw new AdvisorError(
        `AI 어드바이저 예산 초과 (spent=$${costSpent.toFixed(4)} / cap=$${maxBudgetUsd}).`,
        undefined,
        'quota_exceeded',
      )
    }
    // 이번 attempt 옵션: timeout 은 min(perAttempt, remaining), budget 은 남은 잔액.
    const perAttemptTimeout =
      overallTimeoutMs !== undefined
        ? Math.max(1, Math.min(timeout, remainingDeadline))
        : timeout
    const attemptOptions: AdvisorOptions = {
      ...options,
      timeout: perAttemptTimeout,
      maxBudgetUsd: remainingBudget,
      // 재귀 방지 — runAdvisorOnce 는 retry 옵션 무시하지만 명시적으로 clear
      retryOnNoToolUsed: 0,
      overallTimeoutMs: undefined,
    }
    const effectivePrompt = augmentRetryPrompt(prompt, attempt)
    try {
      const result = await runAdvisorOnce(effectivePrompt, attemptOptions)
      costSpent += result.costUsd
      // 성공 monitor — 재시도 성공 시에도 이전 실패 카운트를 리셋
      getGlobalAdvisorMonitor().recordSuccess().catch((e) => {
        console.error('[advisor] monitor.recordSuccess 실패:', e)
      })
      // Codex #487 P1: 최종 반환 costUsd 는 모든 시도의 총합 (부분 실패 spend
      // 도 관측 가능하도록). durationMs 는 성공한 subprocess 만.
      return { ...result, costUsd: costSpent }
    } catch (err) {
      // Codex #487 P1 (2차): 실패 attempt 도 subprocess 가 result event 를 발행
      // 했다면 실제 지출 cost 를 담아 throw. runAdvisorOnce 가 `AdvisorError.
      // costUsd` 로 전달 → 여기서 costSpent 에 누적해야 다음 attempt 의 remaining
      // budget 이 정확히 축소되고 total cap 준수. 이 누적 없으면 각 재시도가
      // 원본 예산 그대로 받아 총 최대 6배 지출 가능 (2차 지적 정확).
      if (err instanceof AdvisorError && typeof err.costUsd === 'number') {
        costSpent += err.costUsd
      }
      if (err instanceof Error) {
        getGlobalAdvisorMonitor().recordFailure(err, options.caller).catch((e) => {
          console.error('[advisor] monitor.recordFailure 실패:', e)
        })
      }
      lastError = err
      if (attempt <= maxRetries && shouldRetryError(err)) {
        // Codex #487 P2: backoff 이후에도 deadline 안에 다음 attempt 가 들어갈
        // 수 있는지 확인. 초과 예상되면 재시도 중단하고 마지막 실패를 throw.
        const elapsedAfterAttempt = Date.now() - startedAt
        const remainingAfterAttempt =
          overallTimeoutMs !== undefined ? overallTimeoutMs - elapsedAfterAttempt : Infinity
        if (remainingAfterAttempt <= RETRY_BACKOFF_MS) {
          console.warn(
            `[advisor] no_tool_used → 재시도 중단 (deadline 초과 예상: ` +
              `remaining=${remainingAfterAttempt}ms < backoff=${RETRY_BACKOFF_MS}ms)`,
          )
          throw err
        }
        console.warn(
          `[advisor] no_tool_used → retry ${attempt}/${maxRetries + 1} ` +
            `(caller=${options.caller ?? 'unknown'}, sleep ${RETRY_BACKOFF_MS}ms, ` +
            `costSpent=$${costSpent.toFixed(4)})`,
        )
        await sleep(RETRY_BACKOFF_MS)
        continue
      }
      throw err
    }
  }
  // Unreachable — for loop 은 항상 return or throw. lastError 는 defensive.
  throw lastError ?? new AdvisorError('AI 응답 실패 (재시도 소진).', undefined, 'unknown')
}

/**
 * 단일 subprocess 시도. `askAdvisor` 내부 retry loop 에서 사용.
 * monitor hook 은 호출하지 않음 (loop 이 시도별로 명시 기록).
 */
async function runAdvisorOnce(
  prompt: string,
  options: AdvisorOptions,
): Promise<AdvisorResult> {
  const {
    timeout = 180_000,
    maxBudgetUsd = 0.50,
    sessionId,
    persist = false,
  } = options
  // Phase 35-A (#433): intent → model 폴백 매핑. 명시 model 우선.
  const model = pickModel(options.model, options.intent)

  const projectRoot = process.env.MYFINANCE_ROOT ?? process.cwd()
  const mcpConfigPath = process.env.MCP_CONFIG_PATH
    ?? path.join(projectRoot, 'src/lib/ai/mcp-config.json')

  const cmdParts = [
    'claude',
    '-p', shellEscape(prompt),
    // Codex PR #484 P1 (3차): `--output-format json` 은 최종 result 텍스트만
    // 노출 → 실제로 어떤 tool 이 호출됐는지 알 수 없음. `stream-json` + `--verbose`
    // 로 각 assistant event 의 `tool_use` block 을 파싱해 `mcp__myfinance__*`
    // 호출 횟수를 정확히 카운트 (expectsTools 검증에 사용).
    '--output-format', 'stream-json',
    '--verbose',
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
    // Codex PR #484 P1 (security): `--tools` 는 built-in Claude Code tool 의
    // **availability allowlist** — 지정 tool 만 subprocess 에서 사용 가능.
    // `--allowedTools` 는 permission prompt 없이 사용 가능한 tool 만 지정
    // (permission bypass) 이며 availability 를 제한하지 않음.
    // → 이 옵션을 없애면 `Read`/`Glob`/`Grep` 등 file system 접근 tool 이 모든
    // `askAdvisor` 호출에서 사용 가능해짐. `Read` 는 기본 permission 이 없어
    // `/ai` 자유 질문 or 웹 컨텐츠 injection 을 통해 `Read /path/.env` 같이
    // 유도되면 secret 노출 가능. `--strict-mcp-config` 는 MCP 만 restrict,
    // built-in tool 은 별도 제한 필요.
    // WebSearch/WebFetch 만 허용하는 이유: 브리핑/AI 채팅에 필요한 웹 정보 조회
    // 는 유지하되 file/exec 계열은 완전 차단. MCP tool 은 이 옵션과 orthogonal
    // 이므로 영향 없음 (필드에서 실측 확인 완료).
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

      // Codex PR #484 P1 (3차): stream-json 은 NDJSON. 마지막 result event 가 최종
      // metadata. 각 assistant event 의 tool_use block 도 함께 수집해 expectsTools
      // 검증에 사용.
      const parsedStream = parseClaudeStreamJson(stdout)
      const output = parsedStream.finalResult
      const toolCalls = parsedStream.toolCalls

      // Codex PR #487 P1 (2차): subprocess 가 result event 를 발행했다면 실
      // 지출 cost 를 담아 error 를 throw. retry loop 이 이걸 costSpent 에 누적
      // 해 다음 attempt 의 remaining budget 을 정확히 축소 (총 cost cap 준수).
      const observedCost =
        output && typeof output.total_cost_usd === 'number' ? output.total_cost_usd : undefined

      if (code !== 0) {
        // stream-json 도 에러 시 result event 를 마지막에 emit 하고 exit code
        // non-zero 로 종료. output 이 파싱 됐으면 그 안의 result/api_error_status
        // 로 classify.
        const stderrTail = stderr.slice(-1024)
        if (stderrTail) console.error('[advisor] claude stderr:', stderrTail)
        const jsonErrorText = output ? extractAdvisorErrorText(output) : ''
        const combined = [jsonErrorText, stderrTail].filter(Boolean).join('\n')
        const errorCode = classifyAdvisorError(combined || undefined)
        const detail = jsonErrorText.slice(0, 1024) || stderrTail || undefined
        reject(new AdvisorError(`Claude CLI 종료 코드: ${code}`, detail, errorCode, observedCost))
        return
      }

      if (!output) {
        // stdout 에 result event 없음 (파싱 실패 or 이상 종료). cost 미기재.
        reject(new AdvisorError('AI 응답을 파싱할 수 없습니다.', undefined, 'parse_error'))
        return
      }

      if (output.is_error) {
        const errorText = extractAdvisorErrorText(output)
        const errorCode = classifyAdvisorError(errorText || undefined)
        reject(new AdvisorError(
          `AI 응답 오류: ${output.result || `api_error_status=${output.api_error_status ?? 'unknown'}`}`,
          errorText.slice(0, 1024) || undefined,
          errorCode,
          observedCost,
        ))
        return
      }

      const numTurns = typeof output.num_turns === 'number' ? output.num_turns : 0

      // Codex PR #484 P1 (3차/4차) — 정확한 evaluator: `mcp__myfinance__*` 중
      // **성공** 한 호출이 최소 1건 있는지. 이전 시도들:
      //   - num_turns >= 2 (3차 지적): WebSearch-only 우회 취약
      //   - tool_use 카운트만 (3차 fix): tool_result 실패 여도 카운트되어 우회 취약
      //   - 응답 fingerprint (2차 fix): plausible 하지만 데이터 없는 report 우회
      //
      // → tool_use.id ↔ tool_result.tool_use_id 매칭으로 실제 성공한 mcp 호출
      // (`isError === false` 인 것만) 을 카운트. fingerprint 는 belt-and-
      // suspenders 로 유지 (모든 tool 이 성공했더라도 최종 응답에 "도구 접근
      // 불가" 안내가 섞이는 부분 실패 케이스 방어).
      if (options.expectsTools) {
        const mcpAttempts = countMcpMyFinanceCalls(toolCalls)
        const mcpSuccesses = countSuccessfulMcpMyFinanceCalls(toolCalls)
        const advertisedFailure = hasNoToolResponse(output.result)
        if (mcpSuccesses === 0 || advertisedFailure) {
          const preview = toolCalls.slice(0, 20)
            .map((c) => {
              // 진단 마커: !err = tool_result is_error=true, ?nores = matching
              // tool_result 없음 (subprocess 이상 종료). 마커 없음 = 성공.
              const marker = c.isError === true ? '!err' : !c.hasResult ? '?nores' : ''
              return `${c.name}${marker}`
            })
            .join(',')
          const detail =
            `mcp_success=${mcpSuccesses} mcp_attempts=${mcpAttempts} ` +
            `total_tool_calls=${toolCalls.length} ` +
            `tools=[${preview}] ` +
            `num_turns=${numTurns} ` +
            `advertised_failure=${advertisedFailure}`
          // Codex PR #487 P2 (5차): flaky (재시도 가치) vs deterministic (재시도
          // 무의미) 분기. mcpAttempts === 0 = Claude 가 tool 을 아예 안 부름 →
          // Claude 판단 flaky, `no_tool_used` (재시도 대상). mcpAttempts > 0
          // 인데 성공 0 = MCP 서버 오류 · validation · tool 예외 등 deterministic
          // 실패 → `mcp_call_failed` (즉시 fallback). advertisedFailure 만 있는
          // 이상 케이스는 Claude 판단이라 flaky 취급.
          const code: AdvisorErrorCode =
            mcpAttempts === 0
              ? 'no_tool_used'
              : mcpSuccesses > 0
                ? 'no_tool_used'  // 성공 있는데 advertisedFailure → 이상 케이스, 재시도 가치
                : 'mcp_call_failed'  // 시도했지만 모두 실패 → deterministic
          const message =
            code === 'mcp_call_failed'
              ? 'myFinance MCP 도구 호출이 모두 실패했습니다.'
              : 'AI 응답이 성공한 myFinance MCP 도구 호출을 갖지 않습니다.'
          reject(new AdvisorError(message, detail, code, observedCost))
          return
        }
      }

      resolve({
        response: output.result,
        model,
        durationMs: output.duration_ms,
        costUsd: output.total_cost_usd,
        sessionId: output.session_id ?? '',
        numTurns,
      })
    })

    child.on('error', (error) => {
      clearTimeout(timer)
      // Phase 40-B: spawn 실패 (ENOENT / EACCES 등) 는 서버 계열 → server_down
      reject(new AdvisorError(`Claude CLI 실행 오류: ${error.message}`, undefined, 'server_down'))
    })
  })

  // #486: monitor hook 은 `askAdvisor` retry loop 이 시도별로 명시 호출.
  // 여기서 hook 을 걸면 loop 의 명시 호출과 중복되어 recordFailure/Success 가
  // 두 번씩 카운트됨 (임계 판정 왜곡). monitor 관리는 loop 이 단일 책임.
  return subprocessPromise
}
