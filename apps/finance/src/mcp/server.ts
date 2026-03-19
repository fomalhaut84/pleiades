import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

import { getPortfolio, getTrades } from './tools/portfolio'
import { getPerformance } from './tools/performance'
import { getGiftTaxStatus, getDividends } from './tools/tax'
import { getSpendingSummary } from './tools/spending'
import { getPrices, getFxRate } from './tools/market'
import { simulateGrowth } from './tools/simulator'
import { getTechnicalAnalysis } from './tools/ta'
import { getHoldingStrategy, getAllStrategies } from './tools/strategy'

const ACCOUNT_NAMES = ['세진', '소담', '다솜', '전체'] as const
const PERIODS = ['1M', '3M', '6M', '1Y', 'ALL'] as const

const server = new McpServer({
  name: 'myfinance',
  version: '1.0.0',
})

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

// --- 서버 시작 ---

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((error) => {
  console.error('MCP server error:', error)
  process.exit(1)
})
