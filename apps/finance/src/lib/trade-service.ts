/**
 * Trade 생성 서비스 — API route와 텔레그램 봇 공유.
 * Prisma transaction으로 Trade 생성 + Holding 재계산을 원자적으로 수행.
 */

import { prisma } from '@/lib/prisma'
import { recalcHolding, calcTotalKRW } from '@/lib/trade-utils'
import { normalizeMarket } from '@/lib/market-hours'

export interface CreateTradeInput {
  accountId: string
  ticker: string
  displayName: string
  market: string
  type: 'BUY' | 'SELL'
  shares: number
  price: number
  currency: string
  fxRate?: number | null
  note?: string | null
  tradedAt: Date
}

export interface CreateTradeResult {
  trade: {
    id: string
    accountId: string
    ticker: string
    displayName: string
    market: string
    type: string
    shares: number
    price: number
    currency: string
    fxRate: number | null
    totalKRW: number
    note: string | null
    tradedAt: Date
  }
  holding: {
    shares: number
    avgPrice: number
    avgPriceFx: number | null
    avgFxRate: number | null
  } | null
  /** 거래 적용 전 holding 스냅샷 (없으면 신규 보유). 토스트 diff 계산용. */
  holdingBefore: {
    shares: number
    avgPrice: number
    avgPriceFx: number | null
    avgFxRate: number | null
  } | null
}

export async function createTrade(input: CreateTradeInput): Promise<CreateTradeResult> {
  const { accountId, ticker, displayName, market, type, shares, price, currency, fxRate, note, tradedAt } = input

  // USD 거래 시 환율 유효성 검증
  if (currency === 'USD' && (typeof fxRate !== 'number' || !Number.isFinite(fxRate) || fxRate <= 0)) {
    throw new Error('USD 거래에는 유효한 환율이 필요합니다.')
  }

  const totalKRW = calcTotalKRW(price, shares, currency, fxRate)

  // 기존 거래와 market/currency 일관성 검증
  // market은 정규화된 값으로 비교 (raw Yahoo 코드 NCM/NYQ 등과 정규화된 US/KR이 혼재할 수 있음)
  const normalizedInputMarket = normalizeMarket(market, ticker)
  const existingTrade = await prisma.trade.findFirst({
    where: { accountId, ticker },
    select: { market: true, currency: true },
  })
  if (existingTrade) {
    const normalizedExisting = normalizeMarket(existingTrade.market, ticker)
    if (normalizedExisting !== normalizedInputMarket || existingTrade.currency !== currency) {
      console.warn(
        `[trade-service] market/currency 불일치 (Trade): ticker=${ticker} ` +
        `existing(raw=${existingTrade.market}, normalized=${normalizedExisting}, ${existingTrade.currency}) ` +
        `input(raw=${market}, normalized=${normalizedInputMarket}, ${currency})`
      )
      throw new Error(`${ticker}은(는) 이미 ${normalizedExisting}/${existingTrade.currency}로 등록되어 있습니다.`)
    }
  }

  // Holding-only 상태 (시드 데이터, Trade 없음)에서도 market/currency 검증
  if (!existingTrade) {
    const existingHolding = await prisma.holding.findUnique({
      where: { accountId_ticker: { accountId, ticker } },
      select: { market: true, currency: true },
    })
    if (existingHolding) {
      const normalizedExisting = normalizeMarket(existingHolding.market, ticker)
      if (normalizedExisting !== normalizedInputMarket || existingHolding.currency !== currency) {
        console.warn(
          `[trade-service] market/currency 불일치 (Holding): ticker=${ticker} ` +
          `existing(raw=${existingHolding.market}, normalized=${normalizedExisting}, ${existingHolding.currency}) ` +
          `input(raw=${market}, normalized=${normalizedInputMarket}, ${currency})`
        )
        throw new Error(`${ticker}은(는) 이미 ${normalizedExisting}/${existingHolding.currency}로 등록되어 있습니다.`)
      }
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    // 거래 적용 전 holding 스냅샷 (토스트 diff 계산용)
    const priorHolding = await tx.holding.findUnique({
      where: { accountId_ticker: { accountId, ticker } },
    })
    const holdingBefore = priorHolding
      ? {
          shares: priorHolding.shares,
          avgPrice: priorHolding.avgPrice,
          avgPriceFx: priorHolding.avgPriceFx,
          avgFxRate: priorHolding.avgFxRate,
        }
      : null

    // SELL: 보유수량 확인
    if (type === 'SELL') {
      if (!priorHolding || priorHolding.shares < shares) {
        const current = priorHolding?.shares ?? 0
        throw new Error(`보유 수량(${current}주)을 초과합니다.`)
      }
    }

    // 시드 Holding 기준선 보존
    const existingTradeCount = await tx.trade.count({ where: { accountId, ticker } })
    if (existingTradeCount === 0) {
      const existingHolding = await tx.holding.findUnique({
        where: { accountId_ticker: { accountId, ticker } },
      })
      if (existingHolding && existingHolding.shares > 0) {
        const baselinePrice = existingHolding.currency === 'USD'
          ? (existingHolding.avgPriceFx ?? existingHolding.avgPrice)
          : existingHolding.avgPrice
        const baselineTotalKRW = Math.round(existingHolding.avgPrice * existingHolding.shares)
        await tx.trade.create({
          data: {
            accountId,
            ticker: existingHolding.ticker,
            displayName: existingHolding.displayName,
            // 사전 검증에서 normalize(existing) === normalizedInputMarket 임이 확인됨 — 입력값 그대로 사용
            market: normalizedInputMarket,
            type: 'BUY',
            shares: existingHolding.shares,
            price: baselinePrice,
            currency: existingHolding.currency,
            fxRate: existingHolding.avgFxRate,
            totalKRW: baselineTotalKRW,
            note: '시드 데이터 기준선',
            tradedAt: new Date(input.tradedAt.getTime() - 86400000), // 사용자 거래보다 1일 전
          },
        })
      }
    }

    const trade = await tx.trade.create({
      data: {
        accountId,
        ticker,
        displayName,
        market: normalizedInputMarket,
        type,
        shares,
        price,
        currency,
        fxRate: currency === 'USD' ? fxRate ?? null : null,
        totalKRW,
        note: note ?? null,
        tradedAt,
      },
    })

    // Holding 재계산
    const allTrades = await tx.trade.findMany({
      where: { accountId, ticker },
      orderBy: [{ tradedAt: 'asc' }, { createdAt: 'asc' }],
      select: { type: true, shares: true, price: true, currency: true, fxRate: true },
    })

    const holdingState = recalcHolding(allTrades)

    let holding = null
    if (holdingState.shares > 0) {
      const upserted = await tx.holding.upsert({
        where: { accountId_ticker: { accountId, ticker } },
        update: {
          shares: holdingState.shares,
          avgPrice: holdingState.avgPrice,
          avgPriceFx: holdingState.avgPriceFx,
          avgFxRate: holdingState.avgFxRate,
        },
        create: {
          accountId,
          ticker,
          displayName,
          market: normalizedInputMarket,
          shares: holdingState.shares,
          avgPrice: holdingState.avgPrice,
          currency,
          avgPriceFx: holdingState.avgPriceFx,
          avgFxRate: holdingState.avgFxRate,
        },
      })
      holding = {
        shares: upserted.shares,
        avgPrice: upserted.avgPrice,
        avgPriceFx: upserted.avgPriceFx,
        avgFxRate: upserted.avgFxRate,
      }
    } else {
      await tx.holding.deleteMany({ where: { accountId, ticker } })
    }

    return { trade, holding, holdingBefore }
  }, { isolationLevel: 'Serializable' })

  return result
}
