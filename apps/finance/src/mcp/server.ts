// 32-B: standalone PM2 프로세스로 승격 후에는 .env 를 스스로 로드해야 함
// (기존 stdio 모드는 부모 프로세스인 bot/next 가 로드해서 상속받았음).
// import 순서상 다른 import 보다 먼저 — Prisma / prisma client 가 DATABASE_URL 을 module load 시점 검사.
import 'dotenv/config'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import { AsyncLocalStorage } from 'node:async_hooks'

import { pickStaleSessions, resolveSessionRequest } from './session-utils'
import { logger, newTraceId, summarizeArgs, installCrashHandlers } from './logger'

import { getPortfolio, getTrades } from './tools/portfolio'
import { getPerformance } from './tools/performance'
import { getGiftTaxStatus, getDividends } from './tools/tax'
import { getSpendingSummary, getTransactions, createTransaction, updateTransaction, deleteTransaction } from './tools/spending'
import { getPrices, getFxRate } from './tools/market'
import { simulateGrowth } from './tools/simulator'
import { getTechnicalAnalysis } from './tools/ta'
import { getHoldingStrategy, getAllStrategies, setHoldingStrategy } from './tools/strategy'
import {
  createCustomStrategy,
  listCustomStrategies,
  updateCustomStrategy,
  deleteCustomStrategy,
} from './tools/custom-strategy'
import { getNetWorth } from './tools/networth'
import { getRsuSchedule, getStockOptions } from './tools/rsu-options'
import { getWatchlist, addWatchlist, updateWatchlist, deleteWatchlist } from './tools/watchlist'
import { createCategory, updateCategory, deleteCategory } from './tools/category'
import { listAssets, createAsset, updateAsset, deleteAsset, createAssetDeposit } from './tools/asset'
import { listBudgets, setBudget, deleteBudget } from './tools/budget'
import { listRecurringTransactions, createRecurringTransaction, updateRecurringTransaction, deleteRecurringTransaction } from './tools/recurring'
import { listAlertConfigs, updateAlertConfig } from './tools/alert'
import { createRsuSchedule, updateRsuSchedule, deleteRsuSchedule } from './tools/rsu-write'
import { vestRsu } from './tools/rsu-vest'
import {
  createStockOption,
  updateStockOption,
  deleteStockOption,
  createStockOptionVesting,
  updateStockOptionVesting,
  deleteStockOptionVesting,
  exerciseVesting,
} from './tools/stock-option-write'

const ACCOUNT_NAMES = ['세진', '소담', '다솜', '전체'] as const
const WRITE_ACCOUNT_NAMES = ['세진', '소담', '다솜'] as const  // '전체' 제외 (쓰기 도구용)
const PERIODS = ['1M', '3M', '6M', '1Y', 'ALL'] as const

/**
 * tools/call 요청 처리 스코프. Handler wrapper 가 실행됐는지 tracking 해
 * SDK 우회 (Zod 검증 실패, 미등록 tool 등) 를 확실히 감지. prefix 매칭 heuristic
 * 대신 AsyncLocalStorage 로 정확한 실행 여부 확인.
 */
interface ToolCallContext {
  handlerInvoked: boolean
  toolName?: string
  args?: unknown
  /** SDK 가 handler 우회로 전송하는 response 를 캡처하여 후처리 시 파싱 */
  capturedResponse?: unknown
}
const toolCallStorage = new AsyncLocalStorage<ToolCallContext>()

/**
 * Transport 를 instrument — tools/call 요청마다 AsyncLocalStorage context 를 열고
 * transport.send 를 tap 해 SDK 응답 캡처. Stdio/HTTP transport 모두 공통.
 * server.connect(transport) 이후 호출해야 SDK 가 등록한 onmessage 를 감쌈.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function attachToolCallInstrumentation(transport: any): void {
  const originalOnMessage = transport.onmessage as
    | ((msg: unknown, extra?: unknown) => void | Promise<void>)
    | undefined
  const originalSend = transport.send.bind(transport) as (
    msg: unknown,
    ...rest: unknown[]
  ) => Promise<void>

  transport.send = async (msg: unknown, ...rest: unknown[]) => {
    // Send 는 onmessage 반환 이후 별도 tick 에서 호출될 수 있어, onmessage 완료 시점에
    // 응답 존재 여부를 판단하기 어려움. 그래서 send 시점에 직접 검사:
    // ctx 존재 + handler 미실행 + error/isError 응답 → SDK 우회. 여기서 로그.
    const ctx = toolCallStorage.getStore()
    if (ctx && !ctx.handlerInvoked && msg && typeof msg === 'object') {
      const asObj = msg as { result?: { isError?: unknown }; error?: unknown }
      if (asObj.error || (asObj.result && (asObj.result as { isError?: unknown }).isError === true)) {
        ctx.capturedResponse = msg
        logSdkBypass(ctx)
      }
    }
    return originalSend(msg, ...rest)
  }

  if (originalOnMessage) {
    transport.onmessage = async (msg: unknown, extra?: unknown) => {
      const req = msg as { method?: string; params?: { name?: string; arguments?: unknown } } | undefined
      if (req?.method === 'tools/call') {
        const ctx: ToolCallContext = {
          handlerInvoked: false,
          toolName: req.params?.name,
          args: req.params?.arguments,
        }
        // AsyncLocalStorage 로 send/handler wrapper 가 context 공유. onmessage 완료 후에도
        // send 가 별도 tick 에서 실행되지만 context 는 유지됨 (Node ALS 는 promise chain
        // 을 통해 전파).
        await toolCallStorage.run(ctx, async () => {
          await originalOnMessage(msg, extra)
        })
      } else {
        await originalOnMessage(msg, extra)
      }
    }
  }
}

/**
 * Handler 우회로 SDK 가 전송한 response 에서 에러 정보 추출 → tool_call_sdk_error 로 로깅.
 * Transport 계층 (JSON message) 대상이라 HTTP SSE 파싱 불필요.
 */
function logSdkBypass(ctx: ToolCallContext): void {
  const response = ctx.capturedResponse as
    | { result?: { isError?: unknown; content?: unknown }; error?: { code?: number; message?: string } }
    | undefined
  if (!response) {
    logger.warn(
      { tool: ctx.toolName ?? 'unknown', args: summarizeArgs(ctx.args), status: 'error', err: { message: 'handler not invoked (no response captured)', kind: 'sdk_error' } },
      'tool_call_sdk_error',
    )
    return
  }
  if (response.error) {
    logger.warn(
      { tool: ctx.toolName ?? 'unknown', args: summarizeArgs(ctx.args), status: 'error', err: { code: response.error.code, message: response.error.message, kind: 'sdk_error' } },
      'tool_call_sdk_error',
    )
    return
  }
  if (response.result) {
    logger.warn(
      { tool: ctx.toolName ?? 'unknown', args: summarizeArgs(ctx.args), status: 'error', err: { message: extractErrorMessage(response.result), kind: 'sdk_error' } },
      'tool_call_sdk_error',
    )
    return
  }
  logger.warn(
    { tool: ctx.toolName ?? 'unknown', args: summarizeArgs(ctx.args), status: 'error', err: { message: 'handler not invoked (empty response)', kind: 'sdk_error' } },
    'tool_call_sdk_error',
  )
}

/**
 * MCP tool result 에서 에러 메시지 추출. toolError() 가 반환하는
 * { isError: true, content: [{ type:'text', text:'오류: ...' }] } 형태 대상.
 */
function extractErrorMessage(result: unknown): string {
  if (!result || typeof result !== 'object') return 'unknown tool error'
  const content = (result as { content?: unknown }).content
  if (Array.isArray(content) && content.length > 0) {
    const first = content[0]
    if (typeof first === 'object' && first !== null && typeof (first as { text?: unknown }).text === 'string') {
      return (first as { text: string }).text
    }
  }
  return 'unknown tool error'
}

/**
 * MCP server factory — 세션마다 fresh 인스턴스 필요 (multi-session HTTP 대응).
 * stdio 모드에서는 단일 호출로 충분, HTTP 모드에서는 initialize 마다 호출.
 *
 * server.tool 을 wrapping 하여 모든 tool 호출을 구조화 로그로 기록.
 * (Phase 32-C — pino instrument)
 */
export function createMyFinanceMcpServer(): McpServer {
  const server = new McpServer({
    name: 'myfinance',
    version: '1.0.0',
  })

  // Monkey-patch server.tool → 각 handler 를 latency/status/traceId 로 계측.
  // 원래 signature 다양 (arg count 4~5) 지만 handler 는 항상 마지막 인자.
  const originalTool = server.tool.bind(server) as (...args: unknown[]) => unknown
  ;(server as unknown as { tool: unknown }).tool = (...args: unknown[]) => {
    if (args.length === 0) return originalTool(...args)
    const toolName = typeof args[0] === 'string' ? args[0] : 'unknown'
    const lastIdx = args.length - 1
    const originalHandler = args[lastIdx]
    if (typeof originalHandler !== 'function') return originalTool(...args)

    const instrumentedHandler = async (...handlerArgs: unknown[]) => {
      // AsyncLocalStorage 로 handler 실행 여부 시그널링 (SDK 우회 감지용).
      const ctx = toolCallStorage.getStore()
      if (ctx) ctx.handlerInvoked = true

      const traceId = newTraceId()
      const start = Date.now()
      try {
        const result = await (originalHandler as (...a: unknown[]) => Promise<unknown>)(...handlerArgs)
        // MCP tool 은 실패를 두 방식으로 시그널: (1) throw, (2) toolError() 가 반환하는
        // { isError: true, content } (resolved result). 후자는 utils.ts 의 SAFE_BUSINESS_PATTERNS
        // 계열 사용자 오류로 자주 발생. status 를 result.isError 로 판단하지 않으면
        // 실패가 로그에서 성공으로 오분류 → 에러율 모니터링 사각지대.
        const isError = typeof result === 'object'
          && result !== null
          && (result as { isError?: unknown }).isError === true
        if (isError) {
          const errMsg = extractErrorMessage(result)
          logger.warn(
            {
              tool: toolName,
              traceId,
              latency_ms: Date.now() - start,
              status: 'error',
              args: summarizeArgs(handlerArgs[0]),
              err: { message: errMsg, kind: 'tool_reported_error' },
            },
            'tool_call_reported_error',
          )
        } else {
          logger.info(
            {
              tool: toolName,
              traceId,
              latency_ms: Date.now() - start,
              status: 'ok',
              args: summarizeArgs(handlerArgs[0]),
            },
            'tool_call',
          )
        }
        return result
      } catch (error) {
        logger.error(
          {
            tool: toolName,
            traceId,
            latency_ms: Date.now() - start,
            status: 'error',
            args: summarizeArgs(handlerArgs[0]),
            err: error instanceof Error
              ? { message: error.message, stack: error.stack, name: error.name }
              : { message: String(error) },
          },
          'tool_call_failed',
        )
        throw error
      }
    }

    const patchedArgs = [...args.slice(0, lastIdx), instrumentedHandler]
    return originalTool(...patchedArgs)
  }

  // --- 포트폴리오 ---

server.tool(
  'get_portfolio',
  '계좌별 보유 종목 + 현재가 + 손익 현황 조회',
  { account_name: z.enum(ACCOUNT_NAMES).describe('계좌명 (세진/소담/다솜/전체)') },
  async (args) => getPortfolio(args)
)

server.tool(
  'get_trades',
  '최근 거래(매수/매도) 내역 조회',
  {
    account_name: z.enum(ACCOUNT_NAMES).describe('계좌명 (세진/소담/다솜/전체)'),
    days: z.number().int().positive().max(3650).optional().describe('조회 일수 (기본 30, 최대 3650)'),
  },
  async (args) => getTrades(args)
)

// --- 성과 ---

server.tool(
  'get_performance',
  'TWR 수익률 + 종목별 기여도 분석',
  {
    account_name: z.enum(ACCOUNT_NAMES).describe('계좌명 (세진/소담/다솜/전체)'),
    period: z.enum(PERIODS).optional().describe('기간 (1M/3M/6M/1Y/ALL, 기본 1M)'),
  },
  async (args) => getPerformance(args)
)

// --- 세금 ---

server.tool(
  'get_gift_tax_status',
  '증여세 비과세 한도 사용 현황 (소담/다솜)',
  {
    account_name: z.enum(['소담', '다솜']).describe('계좌명 (소담/다솜)'),
  },
  async (args) => getGiftTaxStatus(args)
)

server.tool(
  'get_dividends',
  '배당금 수령 내역 + 세금 합계',
  {
    account_name: z.enum(ACCOUNT_NAMES).describe('계좌명 (세진/소담/다솜/전체)'),
    year: z.number().int().min(2000).max(2100).optional().describe('조회 연도 (기본 올해, 2000~2100)'),
  },
  async (args) => getDividends(args)
)

// --- 소비 ---

server.tool(
  'get_spending_summary',
  '월별 소비/수입 카테고리별 요약',
  {
    year: z.number().int().min(2000).max(2100).describe('연도 (2000~2100)'),
    month: z.number().int().min(1).max(12).describe('월 (1~12)'),
  },
  async (args) => getSpendingSummary(args)
)

server.tool(
  'get_transactions',
  '개별 거래 내역 조회 (기간/카테고리/타입 필터, 최대 50건)',
  {
    days: z.number().int().positive().max(365).optional().describe('조회 일수 (기본 7, 최대 365)'),
    category: z.string().optional().describe('카테고리명 (부분 일치, 예: 식비)'),
    type: z.enum(['expense', 'income', 'transfer']).optional().describe('타입 필터'),
  },
  async (args) => getTransactions(args)
)

server.tool(
  'create_transaction',
  '가계부 거래 생성. 카테고리명으로 매칭. 사용자 확인 후 호출.',
  {
    amount: z.number().positive().describe('금액 (원)'),
    description: z.string().min(1).max(200).describe('내용'),
    categoryName: z.string().describe('카테고리명 (부분 일치)'),
    transactedAt: z.string().optional().describe('YYYY-MM-DD (미지정 시 오늘)'),
  },
  async (args) => createTransaction(args)
)

server.tool(
  'update_transaction',
  '가계부 거래 수정 (ID 기반, 제공 필드만 변경). 사용자 확인 후 호출.',
  {
    id: z.string().describe('거래 ID'),
    amount: z.number().positive().optional(),
    description: z.string().min(1).max(200).optional(),
    categoryName: z.string().optional().describe('변경할 카테고리명'),
    transactedAt: z.string().optional().describe('YYYY-MM-DD'),
  },
  async (args) => updateTransaction(args)
)

server.tool(
  'delete_transaction',
  '가계부 거래 삭제. 사용자의 명시적 동의 후에만 호출.',
  {
    id: z.string().describe('삭제할 거래 ID'),
  },
  async (args) => deleteTransaction(args)
)

// --- 시뮬레이션 ---

server.tool(
  'simulate_growth',
  '복리 성장 시뮬레이션 (3가지 시나리오)',
  {
    account_name: z.enum(['세진', '소담', '다솜']).describe('계좌명'),
    years: z.number().int().positive().max(100).optional().describe('시뮬레이션 기간 (기본 10년, 최대 100년)'),
    monthly: z.number().nonnegative().optional().describe('월 적립금 (원, 기본 0)'),
    return_pct: z.number().gt(-100).max(200).optional().describe('연 수익률 % (-100 초과 ~ 200 이하, 미지정 시 5/8/10% 3시나리오)'),
  },
  async (args) => simulateGrowth(args)
)

// --- 시세 ---

server.tool(
  'get_prices',
  '보유 종목 또는 지정 종목의 현재 시세',
  {
    tickers: z.array(z.string()).max(100).optional().describe('티커 목록 (미지정 시 전체 보유 종목, 최대 100개)'),
  },
  async (args) => getPrices(args)
)

server.tool(
  'get_fx_rate',
  '현재 원/달러(USD/KRW) 환율',
  {},
  async () => getFxRate()
)

// --- 기술적 분석 ---

server.tool(
  'get_technical_analysis',
  '종목의 기술적 분석 리포트 (RSI, MACD, BB, SMA, 지지/저항, 종합 시그널)',
  {
    ticker: z.string().describe('Yahoo Finance 티커 (예: AAPL, NVDA)'),
  },
  async (args) => getTechnicalAnalysis(args)
)

// --- 전략 ---

server.tool(
  'get_holding_strategy',
  '종목의 전략 태그, 목표가, 손절가, 메모, 점검일 조회',
  {
    ticker: z.string().describe('티커 (예: NVDA, AAPL)'),
  },
  async (args) => getHoldingStrategy(args)
)

server.tool(
  'get_all_strategies',
  '전체 보유 종목의 전략 현황 (계좌별)',
  {},
  async () => getAllStrategies()
)

server.tool(
  'set_holding_strategy',
  '보유 종목의 전략/목표가/손절가/매수구간/메모/점검일 설정 (upsert). 같은 ticker를 여러 계좌가 보유할 경우 account_name 필수. null 전달 시 필드 초기화. 사용자 확인 후 호출.',
  {
    ticker: z.string().describe('대상 티커'),
    account_name: z.enum(['세진', '소담', '다솜']).optional().describe('여러 계좌 보유 시 대상 특정'),
    strategy: z.enum(['long_hold', 'swing', 'momentum', 'value', 'watch', 'scalp']).optional(),
    targetPrice: z.number().positive().nullable().optional(),
    stopLoss: z.number().positive().nullable().optional(),
    entryLow: z.number().positive().nullable().optional(),
    entryHigh: z.number().positive().nullable().optional(),
    reviewDate: z.string().nullable().optional().describe('YYYY-MM-DD'),
    memo: z.string().max(500).nullable().optional(),
  },
  async (args) => setHoldingStrategy(args)
)

// --- 커스텀 전략 (Phase 29-E) ---

server.tool(
  'create_custom_strategy',
  '자연어로 커스텀 매매 전략 등록. 예: "SOXL이 40달러 이하 + RSI 30 이하 시 알림". AI가 자동으로 조건(price/rsi/macd_signal/sma_cross/bb_position/change_pct)으로 파싱. cron이 조건 만족 여부 감시 → 텔레그램 알림.',
  {
    text: z.string().min(1).max(500).describe('자연어 전략 텍스트'),
  },
  async (args) => createCustomStrategy(args)
)

server.tool(
  'list_custom_strategies',
  '등록된 커스텀 전략 조회. ticker 지정 시 해당 종목만.',
  {
    ticker: z.string().optional(),
    activeOnly: z.boolean().optional().describe('기본 true — false 시 비활성 포함'),
  },
  async (args) => listCustomStrategies(args)
)

server.tool(
  'update_custom_strategy',
  '커스텀 전략 부분 수정 (활성 여부, 빈도, logic, 이름). 조건 자체를 바꾸려면 삭제 후 재등록.',
  {
    id: z.string(),
    isActive: z.boolean().optional(),
    frequency: z.enum(['once', 'daily', 'always']).optional(),
    logic: z.enum(['AND', 'OR']).optional(),
    name: z.string().min(1).max(100).optional(),
  },
  async (args) => updateCustomStrategy(args)
)

server.tool(
  'delete_custom_strategy',
  '커스텀 전략 삭제. id 는 list_custom_strategies 로 확인.',
  {
    id: z.string(),
  },
  async (args) => deleteCustomStrategy(args)
)

// --- 순자산 ---

server.tool(
  'get_networth',
  '현재 순자산 요약 (주식 + 비주식 자산 - 부채 + 카테고리별 + 스냅샷 추이)',
  {},
  async () => getNetWorth()
)

// --- RSU / 스톡옵션 ---

server.tool(
  'get_rsu_schedule',
  'RSU 베스팅 일정 조회 (계좌별, 상태, 주수, 금액)',
  {
    account_name: z.enum(ACCOUNT_NAMES).optional().describe('계좌명 (세진/소담/다솜/전체, 미지정 시 전체)'),
  },
  async (args) => getRsuSchedule(args)
)

server.tool(
  'get_stock_options',
  '스톡옵션 현황 + 베스팅 일정 조회 (행사가, 잔여수량, 만료일)',
  {
    account_name: z.enum(ACCOUNT_NAMES).optional().describe('계좌명 (세진/소담/다솜/전체, 미지정 시 전체)'),
  },
  async (args) => getStockOptions(args)
)

// --- 관심종목 ---

server.tool(
  'get_watchlist',
  '관심종목 목록 + 현재가 + 목표 매수가/매수 구간 대비 현황',
  {},
  async () => getWatchlist()
)

server.tool(
  'add_watchlist',
  '관심종목 추가. 티커 유효성은 Yahoo Finance로 자동 검증. 사용자 확인 후 호출할 것.',
  {
    ticker: z.string().describe('Yahoo Finance 티커 (예: AVAV, 005930.KS)'),
    strategy: z.enum(['long_hold', 'swing', 'momentum', 'value', 'scalp']).optional().describe('전략 (기본 swing)'),
    targetBuy: z.number().positive().optional().describe('목표 매수가'),
    entryLow: z.number().positive().optional().describe('매수 구간 하한'),
    entryHigh: z.number().positive().optional().describe('매수 구간 상한'),
    memo: z.string().max(500).optional().describe('메모'),
  },
  async (args) => addWatchlist(args)
)

server.tool(
  'update_watchlist',
  '관심종목 부분 업데이트. ticker로 식별. 제공된 필드만 변경. 사용자 확인 후 호출할 것.',
  {
    ticker: z.string().describe('대상 티커'),
    strategy: z.enum(['long_hold', 'swing', 'momentum', 'value', 'scalp']).optional(),
    targetBuy: z.number().positive().nullable().optional().describe('null 전달 시 초기화'),
    entryLow: z.number().positive().nullable().optional(),
    entryHigh: z.number().positive().nullable().optional(),
    memo: z.string().max(500).nullable().optional(),
  },
  async (args) => updateWatchlist(args)
)

server.tool(
  'delete_watchlist',
  '관심종목 삭제. 사용자의 명시적 동의 후에만 호출할 것.',
  {
    ticker: z.string().describe('삭제할 티커'),
  },
  async (args) => deleteWatchlist(args)
)

// --- 카테고리 ---

server.tool(
  'create_category',
  '가계부 카테고리 생성. 사용자 확인 후 호출.',
  {
    name: z.string().min(1).max(50).describe('카테고리 이름'),
    type: z.enum(['expense', 'income', 'transfer']).describe('유형'),
    icon: z.string().max(4).optional().describe('이모지 아이콘'),
    keywords: z.array(z.string()).optional().describe('자동 분류 키워드'),
  },
  async (args) => createCategory(args)
)

server.tool(
  'update_category',
  '카테고리 부분 수정 (name으로 식별). 사용자 확인 후 호출.',
  {
    name: z.string().describe('대상 카테고리 이름'),
    newName: z.string().min(1).max(50).optional().describe('변경할 이름'),
    type: z.enum(['expense', 'income', 'transfer']).optional(),
    icon: z.string().max(4).nullable().optional(),
    keywords: z.array(z.string()).optional(),
  },
  async (args) => updateCategory(args)
)

server.tool(
  'delete_category',
  '카테고리 삭제 (연결 거래/예산 있으면 거부). 사용자의 명시적 동의 후에만 호출.',
  {
    name: z.string().describe('삭제할 카테고리 이름'),
  },
  async (args) => deleteCategory(args)
)

// --- 자산 관리 ---

server.tool(
  'list_assets',
  '비주식 자산 목록 조회 (이름, 소유자, 카테고리, 금액).',
  {},
  async () => listAssets()
)

server.tool(
  'create_asset',
  '비주식 자산 생성 (적금/입출금/보험/부동산 등). 사용자 확인 후 호출.',
  {
    name: z.string().min(1).max(100).describe('자산명'),
    category: z.enum(['savings', 'insurance', 'real_estate', 'pension', 'loan', 'cash', 'other']).describe('카테고리'),
    owner: z.string().min(1).describe('소유자 (세진/소담/다솜/공동)'),
    value: z.number().nonnegative().describe('현재 평가액 (원)'),
    isLiability: z.boolean().optional().describe('부채 여부 (기본 false)'),
    interestRate: z.number().optional().describe('이율 (%)'),
    maturityDate: z.string().optional().describe('만기일 YYYY-MM-DD'),
    note: z.string().max(200).optional(),
  },
  async (args) => createAsset(args)
)

server.tool(
  'update_asset',
  '자산 부분 수정 (name으로 식별). 사용자 확인 후 호출.',
  {
    name: z.string().describe('대상 자산명'),
    newName: z.string().min(1).max(100).optional(),
    category: z.enum(['savings', 'insurance', 'real_estate', 'pension', 'loan', 'cash', 'other']).optional(),
    owner: z.string().min(1).optional(),
    value: z.number().nonnegative().optional(),
    isLiability: z.boolean().optional(),
    interestRate: z.number().nullable().optional(),
    maturityDate: z.string().nullable().optional().describe('YYYY-MM-DD, null 전달 시 초기화'),
    note: z.string().max(200).nullable().optional(),
  },
  async (args) => updateAsset(args)
)

server.tool(
  'delete_asset',
  '자산 삭제 (연결 거래/입금 있으면 거부). 사용자의 명시적 동의 후에만 호출.',
  {
    name: z.string().describe('삭제할 자산명'),
  },
  async (args) => deleteAsset(args)
)

server.tool(
  'create_asset_deposit',
  '자산 입금 기록 + Asset.value 자동 반영. 증여/이체 추적용. 사용자 확인 후 호출.',
  {
    assetName: z.string().describe('대상 자산명'),
    amount: z.number().positive().describe('입금액 (원)'),
    source: z.string().describe('출처 (예: 증여, 이체, 급여)'),
    depositedAt: z.string().optional().describe('YYYY-MM-DD (미지정 시 오늘)'),
    note: z.string().max(200).optional(),
  },
  async (args) => createAssetDeposit(args)
)

// --- 예산 ---

server.tool(
  'list_budgets',
  '월 예산 목록 조회 (연/월 필터)',
  {
    year: z.number().int().min(2000).max(2100).optional(),
    month: z.number().int().min(1).max(12).optional(),
  },
  async (args) => listBudgets(args)
)

server.tool(
  'set_budget',
  '카테고리별 월 예산 설정 (upsert). 사용자 확인 후 호출.',
  {
    categoryName: z.string().describe('카테고리명 (대소문자 무시 정확 일치)'),
    year: z.number().int().min(2000).max(2100),
    month: z.number().int().min(1).max(12),
    amount: z.number().nonnegative().describe('예산 금액 (원)'),
  },
  async (args) => setBudget(args)
)

server.tool(
  'delete_budget',
  '예산 삭제 (ID 기반). 사용자의 명시적 동의 후에만 호출.',
  { id: z.string().describe('예산 ID') },
  async (args) => deleteBudget(args)
)

// --- 반복 거래 ---

server.tool(
  'list_recurring_transactions',
  '반복 거래 목록 조회',
  {},
  async () => listRecurringTransactions()
)

server.tool(
  'create_recurring_transaction',
  '반복 거래 신규 등록. 사용자 확인 후 호출.',
  {
    amount: z.number().positive(),
    description: z.string().min(1).max(200),
    categoryName: z.string().describe('카테고리명 (대소문자 무시 정확 일치)'),
    frequency: z.enum(['monthly', 'weekly', 'yearly']),
    dayOfMonth: z.number().int().min(1).max(31).optional(),
    dayOfWeek: z.number().int().min(0).max(6).optional().describe('0=일, 6=토'),
    monthOfYear: z.number().int().min(1).max(12).optional(),
    nextRunAt: z.string().describe('YYYY-MM-DD'),
  },
  async (args) => createRecurringTransaction(args)
)

server.tool(
  'update_recurring_transaction',
  '반복 거래 수정 (ID 기반). 사용자 확인 후 호출.',
  {
    id: z.string(),
    amount: z.number().positive().optional(),
    description: z.string().min(1).max(200).optional(),
    categoryName: z.string().optional().describe('카테고리명 (대소문자 무시 정확 일치)'),
    isActive: z.boolean().optional(),
    frequency: z.enum(['monthly', 'weekly', 'yearly']).optional(),
    dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
    dayOfWeek: z.number().int().min(0).max(6).nullable().optional().describe('0=일, 6=토'),
    monthOfYear: z.number().int().min(1).max(12).nullable().optional(),
    nextRunAt: z.string().optional().describe('YYYY-MM-DD'),
  },
  async (args) => updateRecurringTransaction(args)
)

server.tool(
  'delete_recurring_transaction',
  '반복 거래 삭제 (ID 기반). 사용자의 명시적 동의 후에만 호출.',
  { id: z.string() },
  async (args) => deleteRecurringTransaction(args)
)

// --- 알림 설정 ---

server.tool(
  'list_alert_configs',
  '알림 설정 현황 (급등락/환율/예산/요약시각 등)',
  {},
  async () => listAlertConfigs()
)

server.tool(
  'update_alert_config',
  '알림 설정 값 변경 (기존 키만). 사용자 확인 후 호출.',
  {
    key: z.string().describe('예: price_drop_pct, fx_change_krw, budget_warn_pct, daily_summary_hour, ta_check_interval_min'),
    value: z.string().describe('숫자 문자열'),
  },
  async (args) => updateAlertConfig(args)
)

// --- RSU 스케줄 쓰기 ---

server.tool(
  'create_rsu_schedule',
  'RSU 베스팅 일정 신규 등록. 사용자 확인 후 호출.',
  {
    account_name: z.enum(WRITE_ACCOUNT_NAMES).describe('계좌명 (세진/소담/다솜)'),
    vestingDate: z.string().describe('YYYY-MM-DD 베스팅일'),
    shares: z.number().int().positive().describe('베스팅 수량'),
    basisValue: z.number().nonnegative().describe('기준금액 (원)'),
    basisDate: z.string().optional().describe('YYYY-MM-DD 기준일'),
    basisPrice: z.number().nonnegative().optional().describe('기준 주가'),
    sellShares: z.number().int().nonnegative().optional().describe('매도 예정 수량 (≤ shares)'),
    keepShares: z.number().int().nonnegative().optional().describe('보유 예정 수량 (≤ shares)'),
    note: z.string().max(500).optional(),
  },
  async (args) => createRsuSchedule(args)
)

server.tool(
  'update_rsu_schedule',
  'RSU 스케줄 수정 (ID 기반, pending만). 사용자 확인 후 호출.',
  {
    id: z.string(),
    vestingDate: z.string().optional().describe('YYYY-MM-DD'),
    shares: z.number().int().positive().optional(),
    basisValue: z.number().nonnegative().optional(),
    basisDate: z.string().nullable().optional(),
    basisPrice: z.number().nonnegative().nullable().optional(),
    sellShares: z.number().int().nonnegative().nullable().optional(),
    keepShares: z.number().int().nonnegative().nullable().optional(),
    note: z.string().max(500).nullable().optional(),
  },
  async (args) => updateRsuSchedule(args)
)

server.tool(
  'delete_rsu_schedule',
  'RSU 스케줄 삭제 (pending만). 사용자의 명시적 동의 후에만 호출.',
  { id: z.string() },
  async (args) => deleteRsuSchedule(args)
)

server.tool(
  'vest_rsu',
  'RSU 베스팅 처리: 베스팅일 종가 자동 조회 → BUY/SELL Trade + Holding 자동 반영 + status=vested. autoSell 미지정 시 schedule.sellShares>0 이면 매도 포함. 사용자의 명시적 동의 후에만 호출.',
  {
    id: z.string().describe('RSU 스케줄 ID'),
    autoSell: z.boolean().optional().describe('매도 자동 실행. 미지정 시 schedule.sellShares>0 기본'),
  },
  async (args) => vestRsu(args)
)

// --- 스톡옵션 쓰기 ---

server.tool(
  'create_stock_option',
  '스톡옵션 신규 등록. 사용자 확인 후 호출.',
  {
    account_name: z.enum(WRITE_ACCOUNT_NAMES).describe('계좌명 (세진/소담/다솜)'),
    ticker: z.string().min(1),
    displayName: z.string().min(1),
    grantDate: z.string().describe('YYYY-MM-DD 부여일'),
    expiryDate: z.string().describe('YYYY-MM-DD 만료일'),
    strikePrice: z.number().nonnegative().describe('행사가격'),
    totalShares: z.number().int().positive().describe('총부여수량'),
    note: z.string().max(500).optional(),
  },
  async (args) => createStockOption(args)
)

server.tool(
  'update_stock_option',
  '스톡옵션 수정 (remainingShares 자동 재계산). 사용자 확인 후 호출.',
  {
    id: z.string(),
    ticker: z.string().min(1).optional(),
    displayName: z.string().min(1).optional(),
    grantDate: z.string().optional().describe('YYYY-MM-DD'),
    expiryDate: z.string().optional().describe('YYYY-MM-DD'),
    strikePrice: z.number().nonnegative().optional(),
    totalShares: z.number().int().positive().optional(),
    cancelledShares: z.number().int().nonnegative().optional(),
    adjustedShares: z.number().int().optional(),
    note: z.string().max(500).nullable().optional(),
  },
  async (args) => updateStockOption(args)
)

server.tool(
  'delete_stock_option',
  '스톡옵션 삭제 (행사 스케줄도 함께 삭제). 사용자의 명시적 동의 후에만 호출.',
  { id: z.string() },
  async (args) => deleteStockOption(args)
)

server.tool(
  'create_stock_option_vesting',
  '스톡옵션 행사 스케줄 추가. 사용자 확인 후 호출.',
  {
    stockOptionId: z.string(),
    vestingDate: z.string().describe('YYYY-MM-DD 행사가능일'),
    shares: z.number().int().positive(),
    note: z.string().max(500).optional(),
  },
  async (args) => createStockOptionVesting(args)
)

server.tool(
  'update_stock_option_vesting',
  '행사 스케줄 수정 (pending만). 사용자 확인 후 호출.',
  {
    id: z.string(),
    vestingDate: z.string().optional().describe('YYYY-MM-DD'),
    shares: z.number().int().positive().optional(),
    note: z.string().max(500).nullable().optional(),
  },
  async (args) => updateStockOptionVesting(args)
)

server.tool(
  'delete_stock_option_vesting',
  '행사 스케줄 삭제 (exercised 제외). 사용자의 명시적 동의 후에만 호출.',
  { id: z.string() },
  async (args) => deleteStockOptionVesting(args)
)

server.tool(
  'exercise_vesting',
  '베스팅 상태 전환 (activate: pending→exercisable, exercise: exercisable→exercised, expire: exercisable→expired). 사용자 확인 후 호출.',
  {
    vestingId: z.string(),
    action: z.enum(['activate', 'exercise', 'expire']),
  },
  async (args) => exerciseVesting(args)
)

  return server
}

// --- 서버 시작 ---

const TRANSPORT_MODE = process.env.MCP_TRANSPORT ?? 'stdio'
const HTTP_PORT = parseInt(process.env.MCP_PORT ?? '4200', 10)
const HTTP_HOST = '127.0.0.1'

async function startStdio(): Promise<void> {
  const server = createMyFinanceMcpServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  attachToolCallInstrumentation(transport)
  logger.info({ transport: 'stdio' }, 'transport_ready')
}

/**
 * Multi-session HTTP mode — Phase 32-A PoC 결과 반영.
 *
 * 세션마다 별도 `StreamableHTTPServerTransport` + `McpServer` 페어를 생성해
 * `mcp-session-id` 헤더로 라우팅. 단일 transport 재사용은 재초기화 reject 됨.
 */
/**
 * 세션 idle 상한. 이 시간 동안 요청이 없으면 sweeper 가 정리.
 * Claude CLI 가 timeout/SIGKILL 로 죽으면 DELETE 도 onclose 도 트리거되지 않아
 * transports Map 이 무한 누적. 방어책.
 */
const SESSION_IDLE_TTL_MS = 30 * 60 * 1000 // 30분
const SESSION_SWEEP_INTERVAL_MS = 5 * 60 * 1000 // 5분

interface SessionEntry {
  transport: StreamableHTTPServerTransport
  lastActivityAt: number
}


async function startHttp(): Promise<void> {
  const transports = new Map<string, SessionEntry>()

  const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '/'

    if (url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        ok: true,
        uptime: process.uptime(),
        sessions: transports.size,
        version: '1.0.0',
      }))
      return
    }

    if (url === '/mcp' || url.startsWith('/mcp?')) {
      const t0 = Date.now()
      const sessionIdHeader = (req.headers['mcp-session-id'] as string | undefined) ?? null
      try {
        let body: unknown
        if (req.method === 'POST') {
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          const bodyText = Buffer.concat(chunks).toString('utf-8')
          body = bodyText ? JSON.parse(bodyText) : undefined
        }

        const method = (body as { method?: string } | undefined)?.method ?? '(no-body)'
        const isInit = method === 'initialize'

        let transport: StreamableHTTPServerTransport | undefined
        const resolution = resolveSessionRequest({
          sessionIdHeader,
          hasSession: sessionIdHeader ? transports.has(sessionIdHeader) : false,
          isInitialize: isInit,
        })

        if (resolution === 'reuse') {
          const entry = transports.get(sessionIdHeader!)!
          entry.lastActivityAt = Date.now() // TTL 갱신
          transport = entry.transport
        } else if (resolution === 'create') {
          // sid 를 outer 로 캡처 → SDK 가 sessionId 를 언제 clear 하든 onclose 에서 안정적 삭제.
          let assignedSid: string | undefined
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sid: string) => {
              assignedSid = sid
              transports.set(sid, { transport: transport!, lastActivityAt: Date.now() })
              logger.info({ sid, total: transports.size }, 'session_initialized')
            },
          })
          transport.onclose = () => {
            if (assignedSid) {
              transports.delete(assignedSid)
              logger.info({ sid: assignedSid, total: transports.size }, 'session_closed')
            }
          }
          const s = createMyFinanceMcpServer()
          await s.connect(transport)
          attachToolCallInstrumentation(transport)
        } else if (resolution === 'expired') {
          // Session id 는 있지만 서버에 없음 (sweeper 정리 or 프로세스 재시작).
          // MCP 표준: 404 로 클라이언트가 stale 세션 폐기 후 재초기화하도록 시그널.
          // 400 은 프로토콜 오류로 오해되어 recoverable 상황을 실패로 처리하게 만듬.
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32001, message: `Session not found: ${sessionIdHeader}` },
            id: null,
          }))
          return
        } else {
          // resolution === 'invalid' — session id 없고 initialize 도 아님.
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32600, message: 'Bad Request: no session id and not initialize' },
            id: null,
          }))
          return
        }

        // tools/call SDK 우회 (Zod 검증 실패, 미등록 tool 등) 감지는 transport 계층에서
        // attachToolCallInstrumentation 이 담당 (stdio/HTTP 공통). 여기서는 그대로 위임.
        await transport!.handleRequest(req, res, body)
        logger.info(
          { httpMethod: req.method, rpcMethod: method, sid: sessionIdHeader ?? '(new)', latency_ms: Date.now() - t0 },
          'http_request',
        )
        return
      } catch (error) {
        logger.error({ err: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) }, 'http_request_error')
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'internal_error' }))
        }
        return
      }
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'not_found', url }))
  })

  httpServer.on('error', (err) => {
    // EADDRINUSE 등 listen 실패 시 즉시 종료 → PM2 backoff 로 재시도 (이전 프로세스 정리 대기).
    logger.fatal({ err: { message: err.message, stack: err.stack } }, 'http_server_error')
    process.exit(1)
  })

  httpServer.listen(HTTP_PORT, HTTP_HOST, () => {
    logger.info({ transport: 'http', host: HTTP_HOST, port: HTTP_PORT }, 'transport_ready')
  })

  // Idle session sweeper — Claude CLI 가 timeout/SIGKILL 로 죽으면 DELETE 도
  // onclose 도 트리거되지 않아 transports 가 누적. 주기적으로 idle 세션 close.
  const sweeper = setInterval(() => {
    const stale = pickStaleSessions(transports.entries(), Date.now(), SESSION_IDLE_TTL_MS)
    if (stale.length === 0) return
    logger.info({ count: stale.length, ttl_min: SESSION_IDLE_TTL_MS / 60_000 }, 'session_sweep')
    for (const sid of stale) {
      const entry = transports.get(sid)
      if (!entry) continue
      Promise.resolve(entry.transport.close?.()).catch(() => { /* ignore */ })
      // onclose 콜백이 실행되어야 Map 이 정리되지만, 안전망으로 직접 삭제.
      transports.delete(sid)
    }
  }, SESSION_SWEEP_INTERVAL_MS)
  sweeper.unref?.() // 이벤트 루프 blocker 방지 (shutdown 시 정상 종료 허용)

  // Graceful shutdown — PM2 SIGTERM 대응.
  // httpServer.close() 는 새 연결만 거부하고 SSE 스트림은 유지되므로,
  // 활성 transport 를 명시적으로 close → transports Map 정리 → httpServer close 순서.
  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    clearInterval(sweeper)
    logger.info({ signal, active_sessions: transports.size }, 'shutdown_started')
    const closeTasks = Array.from(transports.values()).map((entry) =>
      Promise.resolve(entry.transport.close?.()).catch((err) => {
        logger.warn({ err: err instanceof Error ? { message: err.message } : String(err) }, 'transport_close_error')
      }),
    )
    await Promise.allSettled(closeTasks)
    transports.clear()
    httpServer.close(() => {
      logger.info({}, 'http_server_closed')
      process.exit(0)
    })
    // Node 18.2+: 활성 소켓도 강제 종료 → SSE 스트림 lingering 방지
    if (typeof (httpServer as unknown as { closeAllConnections?: () => void }).closeAllConnections === 'function') {
      ;(httpServer as unknown as { closeAllConnections: () => void }).closeAllConnections()
    }
    // 15s 이내 강제 종료 (safety net) — unref 하지 않아 이벤트 루프 blocker 로 유지.
    setTimeout(() => {
      logger.warn({}, 'force_exit_timeout')
      process.exit(1)
    }, 15000)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

async function main() {
  // Uncaught/unhandled 크래시를 로그 파일에 stack 과 함께 강제 기록 (PM2 restart 별개).
  installCrashHandlers()

  if (TRANSPORT_MODE === 'http') {
    await startHttp()
  } else {
    await startStdio()
  }
}

main().catch((error) => {
  logger.fatal({ err: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) }, 'server_fatal')
  process.exit(1)
})
