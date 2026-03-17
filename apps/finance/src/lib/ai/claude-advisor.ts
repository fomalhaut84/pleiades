import { execFile } from 'child_process'
import path from 'path'
import { SYSTEM_PROMPT } from './system-prompt'
import { checkAndIncrement, decrement, getRateLimitStatus } from './rate-limiter'

export type AdvisorModel = 'haiku' | 'sonnet'

export interface AdvisorOptions {
  /** 모델 선택 (기본: haiku) */
  model?: AdvisorModel
  /** 타임아웃 ms (기본: 120_000) */
  timeout?: number
  /** API 비용 상한 USD (기본: 0.50) */
  maxBudgetUsd?: number
  /** 일일 호출 제한 (기본: 30) */
  dailyLimit?: number
  /** rate limit 체크 건너뛰기 (외부에서 선체크한 경우) */
  skipRateLimit?: boolean
}

export interface AdvisorResult {
  response: string
  model: AdvisorModel
  durationMs: number
  costUsd: number
  rateLimitRemaining: number
}

export class AdvisorRateLimitError extends Error {
  constructor(
    public remaining: number,
    public resetDate: string
  ) {
    super(`일일 AI 호출 한도에 도달했습니다. (리셋: ${resetDate})`)
    this.name = 'AdvisorRateLimitError'
  }
}

export class AdvisorTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`AI 응답 시간이 초과되었습니다. (${timeoutMs / 1000}초)`)
    this.name = 'AdvisorTimeoutError'
  }
}

export class AdvisorError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AdvisorError'
  }
}

/** 허용된 MCP 읽기 전용 도구 목록 (와일드카드 대신 명시적 allowlist) */
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
].join(',')

interface ClaudeJsonOutput {
  is_error: boolean
  result: string
  duration_ms: number
  total_cost_usd: number
}

/**
 * Claude Code CLI를 subprocess로 호출하여 AI 어드바이저 응답을 생성한다.
 *
 * MCP 서버(myfinance)를 연결하여 DB 데이터를 자동 조회.
 * 빌트인 도구는 비활성화하고 읽기 전용 MCP 도구만 허용.
 */
export async function askAdvisor(
  prompt: string,
  options: AdvisorOptions = {}
): Promise<AdvisorResult> {
  const {
    model = 'haiku',
    timeout = 180_000,
    maxBudgetUsd = 0.50,
    dailyLimit = 30,
  } = options

  // 프롬프트 길이 제한 (10,000자)
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
  if (!Number.isInteger(dailyLimit) || dailyLimit <= 0) {
    throw new AdvisorError('dailyLimit은 양의 정수여야 합니다.')
  }

  // Rate limit 체크 (skipRateLimit: 외부에서 선체크한 경우 건너뛰기)
  const rateLimit = options.skipRateLimit
    ? getRateLimitStatus(dailyLimit)
    : checkAndIncrement(dailyLimit)
  if (!rateLimit.allowed) {
    throw new AdvisorRateLimitError(rateLimit.remaining, rateLimit.resetDate)
  }

  const projectRoot = process.env.MYFINANCE_ROOT ?? process.cwd()
  const mcpConfigPath = process.env.MCP_CONFIG_PATH
    ?? path.join(projectRoot, 'src/lib/ai/mcp-config.json')

  const args = [
    '-p', prompt,
    '--output-format', 'json',
    '--model', model,
    '--system-prompt', SYSTEM_PROMPT,
    '--mcp-config', mcpConfigPath,
    '--strict-mcp-config',
    '--allowedTools', ALLOWED_TOOLS,
    '--tools', '',
    '--max-budget-usd', String(maxBudgetUsd),
    '--permission-mode', 'dontAsk',
    '--no-session-persistence',
  ]

  return new Promise<AdvisorResult>((resolve, reject) => {
    execFile(
      'claude',
      args,
      {
        cwd: projectRoot,
        timeout,
        killSignal: 'SIGKILL', // 타임아웃 시 강제 종료 보장
        maxBuffer: 8 * 1024 * 1024, // 8MB
        env: { ...process.env },
      },
      (error, stdout) => {
        if (error) {
          // 실패 시 rate limit 롤백
          if (!options.skipRateLimit) decrement()

          if (error.killed || error.code === 'ETIMEDOUT') {
            reject(new AdvisorTimeoutError(timeout))
            return
          }
          reject(new AdvisorError(`Claude CLI 실행 오류: ${error.message}`))
          return
        }

        try {
          const output: ClaudeJsonOutput = JSON.parse(stdout)

          if (output.is_error) {
            if (!options.skipRateLimit) decrement()
            reject(new AdvisorError(`AI 응답 오류: ${output.result}`))
            return
          }

          resolve({
            response: output.result,
            model,
            durationMs: output.duration_ms,
            costUsd: output.total_cost_usd,
            rateLimitRemaining: rateLimit.remaining,
          })
        } catch {
          if (!options.skipRateLimit) decrement()
          reject(new AdvisorError('AI 응답을 파싱할 수 없습니다.'))
        }
      }
    )
  })
}
