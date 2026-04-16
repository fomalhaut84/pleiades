import { spawn } from 'child_process'
import path from 'path'
import { SYSTEM_PROMPT } from './system-prompt'

export type AdvisorModel = 'haiku' | 'sonnet'

export interface AdvisorOptions {
  /** 모델 선택 (기본: haiku) */
  model?: AdvisorModel
  /** 타임아웃 ms (기본: 180_000) */
  timeout?: number
  /** API 비용 상한 USD (기본: 0.50) */
  maxBudgetUsd?: number
  /** 기존 세션 이어가기 */
  sessionId?: string
  /** 세션을 디스크에 저장 (기본: false). 텔레그램 AI만 true */
  persist?: boolean
}

export interface AdvisorResult {
  response: string
  model: AdvisorModel
  durationMs: number
  costUsd: number
  sessionId: string
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
  'mcp__firecrawl__firecrawl_search',
  'mcp__firecrawl__firecrawl_scrape',
  'WebSearch',
  'WebFetch',
].join(',')

interface ClaudeJsonOutput {
  is_error: boolean
  result: string
  duration_ms: number
  total_cost_usd: number
  session_id: string
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
    model = 'haiku',
    timeout = 180_000,
    maxBudgetUsd = 0.50,
    sessionId,
    persist = false,
  } = options

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

  return new Promise<AdvisorResult>((resolve, reject) => {
    const chunks: Buffer[] = []
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

    child.on('close', (code) => {
      clearTimeout(timer)

      if (timedOut) {
        reject(new AdvisorTimeoutError(timeout))
        return
      }

      const stdout = Buffer.concat(chunks).toString('utf-8')

      if (code !== 0) {
        reject(new AdvisorError(`Claude CLI 종료 코드: ${code}`))
        return
      }

      try {
        const output: ClaudeJsonOutput = JSON.parse(stdout)

        if (output.is_error) {
          reject(new AdvisorError(`AI 응답 오류: ${output.result}`))
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
        reject(new AdvisorError('AI 응답을 파싱할 수 없습니다.'))
      }
    })

    child.on('error', (error) => {
      clearTimeout(timer)
      reject(new AdvisorError(`Claude CLI 실행 오류: ${error.message}`))
    })
  })
}
