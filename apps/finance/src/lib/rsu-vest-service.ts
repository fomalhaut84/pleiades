/**
 * RSU 베스팅 처리 핵심 로직.
 *
 * - 종가 자동 조회 (yahoo finance) — `getRsuVestPreview()`
 * - vest 트랜잭션 실행 — `processRsuVest()`
 *
 * 호출처: web (`/api/rsu/[id]/vest{,-preview}`), 봇 callback_query, MCP `vest_rsu` 도구.
 * 봇/MCP 는 standalone process 라 HTTP 우회 (prisma 직접) — 같은 service 재사용으로
 * 검증/트랜잭션 로직 한 곳에서만 관리.
 */

import YahooFinance from 'yahoo-finance2'
import { prisma } from '@/lib/prisma'
import { recalcHolding, calcTotalKRW } from '@/lib/trade-utils'

const RSU_TICKER = '035720.KS'
const RSU_DISPLAY_NAME = '카카오'
const RSU_MARKET = 'KR'
const RSU_CURRENCY = 'KRW'

const yahooFinance = new YahooFinance()

export type RsuVestErrorCode =
  | 'NOT_FOUND'
  | 'ALREADY_VESTED'
  | 'INVALID_SELL_SHARES'
  | 'INVALID_PRICE'
  | 'NOT_YET_VESTED'
  | 'PRICE_NOT_SETTLED'

export class RsuVestError extends Error {
  constructor(public code: RsuVestErrorCode) {
    super(code)
    this.name = 'RsuVestError'
  }
}

/** 사용자(웹/봇/AI) 노출용 한국어 메시지. 모든 호출처에서 동일 매핑 사용. */
const RSU_VEST_ERROR_MESSAGE: Record<RsuVestErrorCode, string> = {
  NOT_FOUND: 'RSU 스케줄을 찾을 수 없습니다.',
  ALREADY_VESTED: '이미 베스팅 처리된 스케줄입니다.',
  INVALID_SELL_SHARES: '매도 수량이 베스팅 수량을 초과합니다.',
  INVALID_PRICE: '베스팅일 종가는 0보다 큰 숫자여야 합니다.',
  NOT_YET_VESTED: '베스팅일이 아직 도래하지 않았습니다. 베스팅일 이후 다시 시도해주세요.',
  PRICE_NOT_SETTLED: 'KRX 장 마감 전이라 종가가 확정되지 않았습니다. 마감(15:30 KST) 후 다시 시도해주세요.',
}

/** KRX 정규장 마감 시각 + 종가 확정 안전 마진 (KST) */
const MARKET_CLOSE_HOUR_KST = 15
const MARKET_CLOSE_MIN_KST_INCLUSIVE = 35 // 15:35 KST 부터 commit 허용

/**
 * 베스팅일 종가가 확정되었는지 검사.
 * - vestingDate 가 과거 캘린더일: 항상 OK (마감된 historical close 가 있음)
 * - vestingDate 가 오늘 (KST): 마감 + 안전 마진 (15:35 KST) 통과 시만 OK
 * - vestingDate 가 미래: 별도 NOT_YET_VESTED 분기에서 차단됨 (호출 전 검사)
 */
function isVestPriceSettled(vestingDate: Date, nowMs: number): boolean {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000
  const nowKst = new Date(nowMs + KST_OFFSET_MS)
  const vestKst = new Date(vestingDate.getTime() + KST_OFFSET_MS)
  const nowYmd = `${nowKst.getUTCFullYear()}-${nowKst.getUTCMonth()}-${nowKst.getUTCDate()}`
  const vestYmd = `${vestKst.getUTCFullYear()}-${vestKst.getUTCMonth()}-${vestKst.getUTCDate()}`
  if (nowYmd !== vestYmd) {
    // 과거: settled. 미래: 호출처에서 NOT_YET_VESTED 가드.
    return vestingDate.getTime() <= nowMs
  }
  // 오늘: 마감 + 마진 통과 여부
  const h = nowKst.getUTCHours()
  const m = nowKst.getUTCMinutes()
  if (h > MARKET_CLOSE_HOUR_KST) return true
  if (h === MARKET_CLOSE_HOUR_KST && m >= MARKET_CLOSE_MIN_KST_INCLUSIVE) return true
  return false
}

export function rsuVestErrorMessage(err: RsuVestError): string {
  return RSU_VEST_ERROR_MESSAGE[err.code]
}

export interface RsuVestPreview {
  id: string
  accountId: string
  accountName: string
  ticker: string
  displayName: string
  vestingDate: Date
  shares: number
  sellShares: number | null
  keepShares: number | null
  note: string | null
  /** 자동 조회된 종가. null 이면 yahoo 실패 → 사용자가 직접 입력 필요. */
  vestPrice: number | null
  /** 종가 출처 — 'historical' (베스팅일 ≤ 오늘) / 'current' (베스팅일 미래, 미리보기) / 'fallback' (실패) */
  vestPriceSource: 'historical' | 'current' | 'fallback'
  /** autoSell 기본값 — schedule.sellShares > 0 이면 true */
  autoSellDefault: boolean
}

/**
 * 베스팅일 종가 조회.
 * - 베스팅일이 미래 → 현재가 (미리보기 용도)
 * - 베스팅일 ≤ 오늘 → historical (해당 날짜 종가)
 * 실패 시 null 반환 — 호출처가 fallback 처리.
 */
async function fetchVestPrice(vestingDate: Date): Promise<{ price: number | null; source: RsuVestPreview['vestPriceSource'] }> {
  const isFuture = vestingDate.getTime() > Date.now()
  try {
    if (isFuture) {
      const q = await yahooFinance.quote(RSU_TICKER)
      const price = (q as { regularMarketPrice?: number }).regularMarketPrice
      return { price: typeof price === 'number' ? price : null, source: 'current' }
    }
    // historical: vestingDate 부터 +1 일까지 1d 캔들
    const period1 = new Date(vestingDate)
    const period2 = new Date(vestingDate.getTime() + 86400_000)
    const chart = await yahooFinance.chart(RSU_TICKER, { period1, period2, interval: '1d' })
    const close = chart.quotes?.[0]?.close
    return { price: typeof close === 'number' ? close : null, source: 'historical' }
  } catch (err) {
    console.error('[rsu-vest] fetchVestPrice 실패:', err)
    return { price: null, source: 'fallback' }
  }
}

export async function getRsuVestPreview(id: string): Promise<RsuVestPreview> {
  const schedule = await prisma.rSUSchedule.findUnique({
    where: { id },
    include: { account: { select: { name: true } } },
  })
  if (!schedule) throw new RsuVestError('NOT_FOUND')
  if (schedule.status !== 'pending') throw new RsuVestError('ALREADY_VESTED')

  const { price, source } = await fetchVestPrice(schedule.vestingDate)

  return {
    id: schedule.id,
    accountId: schedule.accountId,
    accountName: schedule.account.name,
    ticker: RSU_TICKER,
    displayName: RSU_DISPLAY_NAME,
    vestingDate: schedule.vestingDate,
    shares: schedule.shares,
    sellShares: schedule.sellShares,
    keepShares: schedule.keepShares,
    note: schedule.note,
    vestPrice: price,
    vestPriceSource: source,
    autoSellDefault: (schedule.sellShares ?? 0) > 0,
  }
}

export interface RsuVestResult {
  schedule: {
    id: string
    status: string
    vestPrice: number | null
    vestedAt: Date | null
  }
  holding: {
    shares: number
    avgPrice: number
  } | null
  buyShares: number
  sellShares: number
  vestPrice: number
}

/**
 * RSU 베스팅 처리 트랜잭션.
 * BUY Trade 생성 + (autoSell 이면) SELL Trade 생성 + Holding 재계산 + schedule.status='vested'.
 */
export async function processRsuVest(id: string, vestPrice: number, autoSell: boolean): Promise<RsuVestResult> {
  if (!Number.isFinite(vestPrice) || vestPrice <= 0) {
    throw new RsuVestError('INVALID_PRICE')
  }

  return prisma.$transaction(
    async (tx) => {
      const schedule = await tx.rSUSchedule.findUnique({ where: { id } })
      if (!schedule) throw new RsuVestError('NOT_FOUND')
      if (schedule.status !== 'pending') throw new RsuVestError('ALREADY_VESTED')
      const now = Date.now()
      // 미래 베스팅을 현재가/preview 가격으로 commit 방지 — vestingDate 도래 후에만 처리 가능
      if (schedule.vestingDate.getTime() > now) {
        throw new RsuVestError('NOT_YET_VESTED')
      }
      // 베스팅일 당일이지만 KRX 장 마감 전이면 yahoo daily candle 이 intraday → 종가 미확정.
      // 마감 + 안전 마진 (15:35 KST) 통과 후에만 commit 허용.
      if (!isVestPriceSettled(schedule.vestingDate, now)) {
        throw new RsuVestError('PRICE_NOT_SETTLED')
      }
      if (schedule.sellShares != null && (schedule.sellShares < 0 || schedule.sellShares > schedule.shares)) {
        throw new RsuVestError('INVALID_SELL_SHARES')
      }

      const accountId = schedule.accountId
      const nowDate = new Date(now)

      // 1. BUY Trade
      const buyTotalKRW = calcTotalKRW(vestPrice, schedule.shares, RSU_CURRENCY)
      await tx.trade.create({
        data: {
          accountId,
          ticker: RSU_TICKER,
          displayName: RSU_DISPLAY_NAME,
          market: RSU_MARKET,
          type: 'BUY',
          shares: schedule.shares,
          price: vestPrice,
          currency: RSU_CURRENCY,
          totalKRW: buyTotalKRW,
          note: `RSU 베스팅 (${schedule.note ?? ''})`,
          tradedAt: schedule.vestingDate,
        },
      })

      // 2. SELL Trade (autoSell + sellShares > 0)
      let sellShares = 0
      if (autoSell && schedule.sellShares && schedule.sellShares > 0) {
        sellShares = schedule.sellShares
        const sellTotalKRW = calcTotalKRW(vestPrice, sellShares, RSU_CURRENCY)
        await tx.trade.create({
          data: {
            accountId,
            ticker: RSU_TICKER,
            displayName: RSU_DISPLAY_NAME,
            market: RSU_MARKET,
            type: 'SELL',
            shares: sellShares,
            price: vestPrice,
            currency: RSU_CURRENCY,
            totalKRW: sellTotalKRW,
            note: `RSU 베스팅 직후 매도 (${schedule.note ?? ''})`,
            tradedAt: schedule.vestingDate,
          },
        })
      }

      // 3. Holding 재계산
      const allTrades = await tx.trade.findMany({
        where: { accountId, ticker: RSU_TICKER },
        orderBy: [{ tradedAt: 'asc' }, { createdAt: 'asc' }],
        select: { type: true, shares: true, price: true, currency: true, fxRate: true },
      })
      const holdingState = recalcHolding(allTrades)

      let holding: RsuVestResult['holding'] = null
      if (holdingState.shares > 0) {
        const upserted = await tx.holding.upsert({
          where: { accountId_ticker: { accountId, ticker: RSU_TICKER } },
          update: {
            shares: holdingState.shares,
            avgPrice: holdingState.avgPrice,
            avgPriceFx: holdingState.avgPriceFx,
            avgFxRate: holdingState.avgFxRate,
          },
          create: {
            accountId,
            ticker: RSU_TICKER,
            displayName: RSU_DISPLAY_NAME,
            market: RSU_MARKET,
            shares: holdingState.shares,
            avgPrice: holdingState.avgPrice,
            currency: RSU_CURRENCY,
            avgPriceFx: holdingState.avgPriceFx,
            avgFxRate: holdingState.avgFxRate,
          },
        })
        holding = { shares: upserted.shares, avgPrice: upserted.avgPrice }
      } else {
        await tx.holding.deleteMany({ where: { accountId, ticker: RSU_TICKER } })
      }

      // 4. schedule.status='vested'
      const updated = await tx.rSUSchedule.update({
        where: { id },
        data: { status: 'vested', vestPrice, vestedAt: nowDate },
      })

      return {
        schedule: {
          id: updated.id,
          status: updated.status,
          vestPrice: updated.vestPrice,
          vestedAt: updated.vestedAt,
        },
        holding,
        buyShares: schedule.shares,
        sellShares,
        vestPrice,
      }
    },
    { isolationLevel: 'Serializable' },
  )
}
