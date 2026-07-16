/**
 * 급등락 / 환율 변동 알림
 *
 * refreshPrices() 후 호출.
 * AlertConfig 임계값 초과 시 텔레그램 알림.
 * 중복 방지: 동일 종목 당일 1회만 발송.
 */

import { prisma } from '@/lib/prisma'
import { getBot } from '@/bot/index'
import { formatPercent } from '@/bot/utils/formatter'
import { sendHtml, escapeHtml } from '@/bot/utils/telegram'
import { isMarketOpenFor } from '@/lib/market-hours'
import {
  computeDeliveryStatus,
  recordAlertHistory,
  type AlertEventInput,
} from './alert-history'
import { buildPriceContext, buildFxContext } from '@/lib/alert-history/context'

const WATCHLIST_MHO_KEY = 'watchlist_market_hours_only'
const WATCHLIST_MHO_LABEL = '관심종목 매수 알림 — 장중에만'

/**
 * 관심종목 목표매수가/매수구간 알림의 시간대 제한 설정 초기화 (Phase 33-D / #415).
 * `off` (기본) = 24h 발송, `on` = 각 시장 거래시간에만 발송.
 * 봇 시작 시 upsert 로 row 존재 보장 → 설정 페이지에 자동 노출.
 */
export async function ensureWatchlistMarketHoursOnlySetting(): Promise<void> {
  try {
    await prisma.alertConfig.upsert({
      where: { key: WATCHLIST_MHO_KEY },
      update: {},
      create: { key: WATCHLIST_MHO_KEY, value: 'off', label: WATCHLIST_MHO_LABEL },
    })
  } catch (error) {
    console.error('[notification] watchlist_market_hours_only 설정 초기화 실패:', error)
  }
}

/**
 * Pure — 관심종목 매수 알림 발동을 시간대 제한 규칙으로 건너뛸지 판단.
 * marketHoursOnly=false 이면 항상 발동 (24h). true 이면 해당 시장 장중에만 발동.
 * `marketOpen` 은 실제 판정 함수 주입 (테스트 용이).
 */
export function shouldSkipWatchlistAlert(
  marketHoursOnly: boolean,
  market: string,
  ticker: string,
  marketOpen: (market: string, ticker: string) => boolean = isMarketOpenFor,
): boolean {
  if (!marketHoursOnly) return false
  return !marketOpen(market, ticker)
}

/** 당일 알림 발송 기록 (ticker → date string) */
const sentToday = new Map<string, string>()

function getTodayKST(): string {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

function resetIfNewDay(): void {
  const today = getTodayKST()
  if (sentToday.size > 0) {
    const firstDate = sentToday.values().next().value
    if (firstDate !== today) {
      sentToday.clear()
    }
  }
}

/**
 * 주가/환율 변동 알림 체크 + 발송
 * refreshPrices() 직후 호출
 */
export async function checkPriceAlerts(chatIds: number[]): Promise<void> {
  if (chatIds.length === 0) return

  resetIfNewDay()
  const today = getTodayKST()

  // AlertConfig에서 임계값 조회
  const configs = await prisma.alertConfig.findMany({
    where: {
      key: { in: ['price_drop_pct', 'price_surge_pct', 'fx_change_krw', WATCHLIST_MHO_KEY] },
    },
  })
  const configMap = new Map(configs.map((c) => [c.key, c.value]))

  const parseOrDefault = (key: string, fallback: number): number => {
    const raw = parseFloat(configMap.get(key) ?? '')
    return Number.isFinite(raw) ? raw : fallback
  }

  const dropThreshold = parseOrDefault('price_drop_pct', -5)
  const surgeThreshold = parseOrDefault('price_surge_pct', 5)
  const fxThreshold = parseOrDefault('fx_change_krw', 50)
  const watchlistMarketHoursOnly = (configMap.get(WATCHLIST_MHO_KEY) ?? 'off').toLowerCase() === 'on'

  // 보유 종목만 조회 (전체 PriceCache가 아니라)
  const holdings = await prisma.holding.findMany({
    select: { ticker: true, displayName: true },
    distinct: ['ticker'],
  })
  const holdingTickers = new Set(holdings.map((h) => h.ticker))
  const nameMap = new Map(holdings.map((h) => [h.ticker, h.displayName]))

  // 관심종목 티커도 수집
  const watchlistTickers = await prisma.watchlist.findMany({
    select: { ticker: true },
  })
  const allTickerSet = new Set(Array.from(holdingTickers))
  for (const w of watchlistTickers) allTickerSet.add(w.ticker)
  allTickerSet.add('USDKRW=X')
  const allTickers = Array.from(allTickerSet)

  // PriceCache에서 변동률 조회
  const prices = await prisma.priceCache.findMany({
    where: { ticker: { in: allTickers } },
  })

  const priceMap = new Map(prices.map((p) => [p.ticker, p]))
  const events: AlertEventInput[] = []

  for (const p of prices) {
    // 환율은 별도 처리
    if (p.ticker === 'USDKRW=X') {
      if (p.change != null && Math.abs(p.change) >= fxThreshold) {
        const key = `fx:${p.ticker}`
        if (sentToday.get(key) === today) continue
        sentToday.set(key, today)

        const direction = p.change > 0 ? '📈 상승' : '📉 하락'
        events.push({
          kind: 'fx',
          ticker: p.ticker,
          price: p.price,
          changePercent: p.changePercent,
          message: `💱 환율 ${direction}: ${p.price.toLocaleString('ko-KR')}원 (${p.change > 0 ? '+' : ''}${p.change.toFixed(0)}원)`,
          context: buildFxContext({
            rate: p.price,
            changeKrw: p.change,
            changePercent: p.changePercent,
          }),
        })
      }
      continue
    }

    // 주가 급등락 — 해당 시장 거래시간일 때만 알림 (장외 허위 변동 차단)
    if (p.changePercent == null) continue
    if (!holdingTickers.has(p.ticker)) continue

    // PriceCache.market을 단일 소스로 사용 (ticker 기준 결정적)
    if (!isMarketOpenFor(p.market, p.ticker)) continue

    const key = `price:${p.ticker}`
    if (sentToday.get(key) === today) continue

    if (p.changePercent <= dropThreshold) {
      sentToday.set(key, today)
      const name = nameMap.get(p.ticker) ?? p.ticker
      events.push({
        kind: 'drop',
        ticker: p.ticker,
        price: p.price,
        changePercent: p.changePercent,
        message: `🔴 ${name} (${p.ticker}) 급락: ${formatPercent(p.changePercent)}`,
        context: buildPriceContext({
          type: 'drop',
          price: p.price,
          changePercent: p.changePercent,
          threshold: dropThreshold,
          // 도착 조건상 marketOpen 은 true (isMarketOpenFor 통과했음)
          marketOpen: true,
        }),
      })
    } else if (p.changePercent >= surgeThreshold) {
      sentToday.set(key, today)
      const name = nameMap.get(p.ticker) ?? p.ticker
      events.push({
        kind: 'surge',
        ticker: p.ticker,
        price: p.price,
        changePercent: p.changePercent,
        message: `🟢 ${name} (${p.ticker}) 급등: ${formatPercent(p.changePercent)}`,
        context: buildPriceContext({
          type: 'surge',
          price: p.price,
          changePercent: p.changePercent,
          threshold: surgeThreshold,
          marketOpen: true,
        }),
      })
    }
  }

  // --- 보유종목 목표가/손절가 체크 ---
  const strategies = await prisma.holdingStrategy.findMany({
    where: {
      OR: [
        { targetPrice: { not: null } },
        { stopLoss: { not: null } },
      ],
    },
    include: {
      holding: { select: { ticker: true, displayName: true, currency: true } },
    },
  })

  for (const s of strategies) {
    const price = priceMap.get(s.holding.ticker)
    if (!price) continue

    const currentPrice = price.price
    const name = escapeHtml(s.holding.displayName)
    const ticker = escapeHtml(s.holding.ticker)

    if (s.targetPrice != null && currentPrice >= s.targetPrice) {
      const key = `target:${s.holding.ticker}`
      if (sentToday.get(key) !== today) {
        sentToday.set(key, today)
        events.push({
          kind: 'target_hit',
          ticker: s.holding.ticker,
          price: currentPrice,
          changePercent: price.changePercent,
          message: `🎯 ${name} (${ticker}) 목표가 도달: ${currentPrice.toLocaleString('ko-KR')} (목표 ${s.targetPrice.toLocaleString('ko-KR')})`,
          context: buildPriceContext({
            type: 'target_hit',
            price: currentPrice,
            changePercent: price.changePercent,
            threshold: s.targetPrice,
            // 24h 알림 — 시장 개장 여부는 티커별 판정
            marketOpen: isMarketOpenFor(price.market, s.holding.ticker),
          }),
        })
      }
    }

    if (s.stopLoss != null && currentPrice <= s.stopLoss) {
      const key = `stoploss:${s.holding.ticker}`
      if (sentToday.get(key) !== today) {
        sentToday.set(key, today)
        events.push({
          kind: 'stop_loss',
          ticker: s.holding.ticker,
          price: currentPrice,
          changePercent: price.changePercent,
          message: `🛑 ${name} (${ticker}) 손절가 도달: ${currentPrice.toLocaleString('ko-KR')} (손절 ${s.stopLoss.toLocaleString('ko-KR')})`,
          context: buildPriceContext({
            type: 'stop_loss',
            price: currentPrice,
            changePercent: price.changePercent,
            threshold: s.stopLoss,
            marketOpen: isMarketOpenFor(price.market, s.holding.ticker),
          }),
        })
      }
    }
  }

  // --- 관심종목 목표 매수가/매수구간 체크 ---
  const watchlist = await prisma.watchlist.findMany({
    where: {
      OR: [
        { targetBuy: { not: null } },
        { entryLow: { not: null } },
      ],
    },
  })

  for (const w of watchlist) {
    const price = priceMap.get(w.ticker)
    if (!price) continue

    // 관심종목 알림 시간대 토글 (Phase 33-D / #415)
    // — on 이면 매수구간/목표매수가 알림을 각 시장 거래시간에만 발송 (기본 off = 24h).
    if (shouldSkipWatchlistAlert(watchlistMarketHoursOnly, price.market, w.ticker)) continue

    const name = escapeHtml(w.displayName)
    const ticker = escapeHtml(w.ticker)

    if (w.targetBuy != null && price.price <= w.targetBuy) {
      const key = `wbuy:${w.ticker}`
      if (sentToday.get(key) !== today) {
        sentToday.set(key, today)
        events.push({
          kind: 'watch_buy',
          ticker: w.ticker,
          price: price.price,
          changePercent: price.changePercent,
          message: `💰 ${name} (${ticker}) 목표 매수가 도달: ${price.price.toLocaleString('ko-KR')} (목표 ${w.targetBuy.toLocaleString('ko-KR')})`,
          context: buildPriceContext({
            type: 'watch_buy',
            price: price.price,
            changePercent: price.changePercent,
            threshold: w.targetBuy,
            marketOpen: isMarketOpenFor(price.market, w.ticker),
          }),
        })
      }
    }

    if (w.entryLow != null && w.entryHigh != null && price.price >= w.entryLow && price.price <= w.entryHigh) {
      const key = `wzone:${w.ticker}`
      if (sentToday.get(key) !== today) {
        sentToday.set(key, today)
        events.push({
          kind: 'watch_zone',
          ticker: w.ticker,
          price: price.price,
          changePercent: price.changePercent,
          message: `🔔 ${name} (${ticker}) 매수구간 진입: ${price.price.toLocaleString('ko-KR')} (구간 ${w.entryLow.toLocaleString('ko-KR')}~${w.entryHigh.toLocaleString('ko-KR')})`,
          context: buildPriceContext({
            type: 'watch_zone',
            price: price.price,
            changePercent: price.changePercent,
            // 구간은 상한을 임계값으로 저장 (하한은 message 에 이미 포함)
            threshold: w.entryHigh,
            marketOpen: isMarketOpenFor(price.market, w.ticker),
          }),
        })
      }
    }
  }

  if (events.length === 0) return

  const bot = getBot()
  const combined = `⚡ <b>변동 알림</b>\n\n${events.map((e) => e.message).join('\n')}`

  let sendSuccess = 0
  let lastError: string | undefined
  for (const chatId of chatIds) {
    try {
      await sendHtml(bot, chatId, combined)
      sendSuccess++
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      console.error(`[notification] 변동 알림 발송 실패 (chatId: ${chatId}):`, error)
    }
  }

  // Phase 33-A (#416): 각 이벤트 이력 저장 (배송 상태 요약)
  const status = computeDeliveryStatus(sendSuccess, chatIds.length)
  await recordAlertHistory(events, status, chatIds.length, status === 'sent' ? undefined : lastError)

  console.log(`[notification] 변동 알림 발송: ${events.length}건 → ${sendSuccess}/${chatIds.length} chats`)
}
