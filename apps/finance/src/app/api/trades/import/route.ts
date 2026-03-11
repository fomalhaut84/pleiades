import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recalcHolding, calcTotalKRW, validateTradeInput } from '@/lib/trade-utils'
import type { ImportResult } from '@/types/csv-import'

export const dynamic = 'force-dynamic'

const MAX_ROWS = 500

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { accountId, market, currency, skipDuplicates, trades } = body

    if (!accountId || !market || !currency || !Array.isArray(trades)) {
      return NextResponse.json(
        { error: '필수 필드가 누락되었습니다.' },
        { status: 400 }
      )
    }

    if (!['US', 'KR'].includes(market)) {
      return NextResponse.json({ error: '잘못된 시장입니다.' }, { status: 400 })
    }
    if (!['USD', 'KRW'].includes(currency)) {
      return NextResponse.json({ error: '잘못된 통화입니다.' }, { status: 400 })
    }
    if (market === 'US' && currency !== 'USD') {
      return NextResponse.json({ error: 'US 시장은 USD만 가능합니다.' }, { status: 400 })
    }
    if (market === 'KR' && currency !== 'KRW') {
      return NextResponse.json({ error: 'KR 시장은 KRW만 가능합니다.' }, { status: 400 })
    }

    if (trades.length === 0) {
      return NextResponse.json({ error: '임포트할 거래가 없습니다.' }, { status: 400 })
    }
    if (trades.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `최대 ${MAX_ROWS}건까지 임포트 가능합니다.` },
        { status: 400 }
      )
    }

    // 계좌 존재 확인
    const account = await prisma.account.findUnique({ where: { id: accountId } })
    if (!account) {
      return NextResponse.json({ error: '계좌를 찾을 수 없습니다.' }, { status: 404 })
    }

    // 각 행 검증
    const validTrades: Array<{
      index: number
      ticker: string
      displayName: string
      type: 'BUY' | 'SELL'
      shares: number
      price: number
      fxRate: number | null
      tradedAt: string
      note: string | null
    }> = []
    const resultErrors: ImportResult['errors'] = []

    for (let i = 0; i < trades.length; i++) {
      const t = trades[i]
      if (!t || typeof t !== 'object') {
        resultErrors.push({ row: i + 1, field: 'row', message: '잘못된 데이터 형식입니다.' })
        continue
      }
      const ticker = typeof t.ticker === 'string' ? t.ticker : String(t.ticker ?? '')
      const displayName = typeof t.displayName === 'string' ? t.displayName : ticker
      const tradeType = typeof t.type === 'string' ? t.type : String(t.type ?? '')
      const shares = typeof t.shares === 'number' ? t.shares : Number(t.shares)
      const price = typeof t.price === 'number' ? t.price : Number(t.price)
      const fxRate = t.fxRate != null ? (typeof t.fxRate === 'number' ? t.fxRate : Number(t.fxRate)) : null
      const tradedAt = typeof t.tradedAt === 'string' ? t.tradedAt : String(t.tradedAt ?? '')
      const errors = validateTradeInput({
        accountId,
        ticker,
        displayName: displayName || ticker,
        market,
        type: tradeType,
        shares,
        price,
        currency,
        fxRate: currency === 'USD' ? fxRate : null,
        tradedAt,
      })

      if (errors.length > 0) {
        for (const e of errors) {
          resultErrors.push({ row: i + 1, field: e.field, message: e.message })
        }
      } else {
        validTrades.push({
          index: i,
          ticker: ticker.toUpperCase().trim(),
          displayName: displayName || ticker,
          type: tradeType as 'BUY' | 'SELL',
          shares,
          price,
          fxRate: currency === 'USD' ? fxRate : null,
          tradedAt,
          note: typeof t.note === 'string' ? t.note : null,
        })
      }
    }

    // 기존 거래/보유와 market/currency 일관성 검증
    const tickers = Array.from(new Set(validTrades.map((t) => t.ticker)))
    const existingMeta = await prisma.trade.findMany({
      where: { accountId, ticker: { in: tickers } },
      select: { ticker: true, market: true, currency: true },
      distinct: ['ticker'],
    })
    for (const meta of existingMeta) {
      if (meta.market !== market || meta.currency !== currency) {
        return NextResponse.json(
          { error: `${meta.ticker}은(는) 이미 ${meta.market}/${meta.currency}로 등록되어 있습니다.` },
          { status: 400 }
        )
      }
    }
    // Holding 테이블도 검증 (Trade 없이 Holding만 있는 시드 데이터 대응)
    const existingHoldings = await prisma.holding.findMany({
      where: { accountId, ticker: { in: tickers } },
      select: { ticker: true, market: true, currency: true },
    })
    for (const h of existingHoldings) {
      if (h.market !== market || h.currency !== currency) {
        return NextResponse.json(
          { error: `${h.ticker}은(는) 이미 ${h.market}/${h.currency}로 등록되어 있습니다.` },
          { status: 400 }
        )
      }
    }

    // 중복 감지용 기존 거래 조회 (P2-2: type 포함)
    const existingTrades = await prisma.trade.findMany({
      where: { accountId, ticker: { in: tickers } },
      select: { ticker: true, type: true, tradedAt: true, shares: true, price: true },
    })

    const existingSet = new Set(
      existingTrades.map((t) => {
        const d = t.tradedAt instanceof Date ? t.tradedAt : new Date(t.tradedAt)
        const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
        return `${t.ticker}|${t.type}|${dateStr}|${t.shares}|${Number(t.price.toFixed(4))}`
      })
    )

    const toCreate: typeof validTrades = []
    let skipped = 0
    const batchSet = new Set<string>()

    for (const t of validTrades) {
      const dateStr = t.tradedAt.slice(0, 10) // YYYY-MM-DD
      const key = `${t.ticker}|${t.type}|${dateStr}|${t.shares}|${Number(t.price.toFixed(4))}`
      if (existingSet.has(key) || batchSet.has(key)) {
        if (skipDuplicates) {
          skipped++
          continue
        }
      }
      batchSet.add(key)
      toCreate.push(t)
    }

    if (toCreate.length === 0) {
      const result: ImportResult = {
        total: trades.length,
        created: 0,
        skipped,
        failed: resultErrors.length > 0 ? trades.length - skipped : 0,
        errors: resultErrors,
      }
      return NextResponse.json({ result }, { status: 201 })
    }

    // Serializable 트랜잭션: 일괄 생성 + Holding 재계산
    const created = await prisma.$transaction(async (tx) => {
      // 시드 Holding 기준선 보존 (P2-1): Trade가 없는 기존 Holding에 baseline BUY 생성
      const affectedTickersForBaseline = Array.from(new Set(toCreate.map((t) => t.ticker)))
      for (const ticker of affectedTickersForBaseline) {
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
            // baseline 날짜: 해당 ticker 임포트 최소 날짜 - 1일
            const tickerTrades = toCreate.filter((t) => t.ticker === ticker)
            const earliestDate = tickerTrades.reduce((min, t) => {
              return t.tradedAt < min ? t.tradedAt : min
            }, tickerTrades[0].tradedAt)
            const baselineDate = new Date(earliestDate)
            baselineDate.setUTCDate(baselineDate.getUTCDate() - 1)

            await tx.trade.create({
              data: {
                accountId,
                ticker: existingHolding.ticker,
                displayName: existingHolding.displayName,
                market: existingHolding.market,
                type: 'BUY',
                shares: existingHolding.shares,
                price: baselinePrice,
                currency: existingHolding.currency,
                fxRate: existingHolding.avgFxRate,
                totalKRW: baselineTotalKRW,
                note: '시드 데이터 기준선',
                tradedAt: baselineDate,
              },
            })
          }
        }
      }

      const createdTrades = []

      for (const t of toCreate) {
        const totalKRW = calcTotalKRW(t.price, t.shares, currency, t.fxRate)
        const trade = await tx.trade.create({
          data: {
            accountId,
            ticker: t.ticker,
            displayName: t.displayName,
            market,
            type: t.type,
            shares: t.shares,
            price: t.price,
            currency,
            fxRate: t.fxRate,
            totalKRW,
            note: t.note,
            tradedAt: new Date(t.tradedAt),
          },
        })
        createdTrades.push(trade)
      }

      // 영향받은 ticker별 Holding 재계산
      const affectedTickers = Array.from(new Set(toCreate.map((t) => t.ticker)))
      for (const ticker of affectedTickers) {
        const allTrades = await tx.trade.findMany({
          where: { accountId, ticker },
          orderBy: [{ tradedAt: 'asc' }, { createdAt: 'asc' }],
          select: { type: true, shares: true, price: true, currency: true, fxRate: true },
        })

        const holdingState = recalcHolding(allTrades)
        const sampleTrade = toCreate.find((t) => t.ticker === ticker)!

        if (holdingState.shares > 0) {
          await tx.holding.upsert({
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
              displayName: sampleTrade.displayName,
              market,
              shares: holdingState.shares,
              avgPrice: holdingState.avgPrice,
              currency,
              avgPriceFx: holdingState.avgPriceFx,
              avgFxRate: holdingState.avgFxRate,
            },
          })
        } else {
          await tx.holding.deleteMany({ where: { accountId, ticker } })
        }
      }

      return createdTrades.length
    }, { isolationLevel: 'Serializable' })

    const result: ImportResult = {
      total: trades.length,
      created,
      skipped,
      failed: resultErrors.length > 0 ? trades.length - created - skipped : 0,
      errors: resultErrors,
    }

    return NextResponse.json({ result }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && (error.message.includes('초과합니다') || error.message.startsWith('보유 수량 부족'))) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('POST /api/trades/import error:', error)
    return NextResponse.json(
      { error: '거래 일괄 등록에 실패했습니다.' },
      { status: 500 }
    )
  }
}
