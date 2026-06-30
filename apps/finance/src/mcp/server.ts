import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

import { getPortfolio, getTrades } from './tools/portfolio'
import { getPerformance } from './tools/performance'
import { getGiftTaxStatus, getDividends } from './tools/tax'
import { getSpendingSummary, getTransactions, createTransaction, updateTransaction, deleteTransaction } from './tools/spending'
import { getPrices, getFxRate } from './tools/market'
import { simulateGrowth } from './tools/simulator'
import { getTechnicalAnalysis } from './tools/ta'
import { getHoldingStrategy, getAllStrategies, setHoldingStrategy } from './tools/strategy'
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
    strategy: z.enum(['swing', 'momentum', 'value', 'scalp']).optional().describe('전략 (기본 swing)'),
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
    strategy: z.enum(['swing', 'momentum', 'value', 'scalp']).optional(),
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

// --- 서버 시작 ---

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((error) => {
  console.error('MCP server error:', error)
  process.exit(1)
})
