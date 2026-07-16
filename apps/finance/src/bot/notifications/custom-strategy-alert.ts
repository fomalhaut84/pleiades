/**
 * Phase 29-E — 커스텀 전략 알림 스캐너.
 *
 * refreshPrices() 직후 호출. 활성 전략을 ticker 단위로 그루핑하고:
 *   1) priceCache 에서 PriceSnapshot 조회
 *   2) TA 필요 조건이 있을 때만 generateTAReport 호출 (비싸므로 캐시)
 *   3) evaluator 로 조건 평가 → satisfied 시 텔레그램 발송
 *   4) frequency (once/daily/always) 로 dedup + DB.lastTriggeredAt 갱신
 *
 * `AlertConfig.custom_strategy_alerts` = 'off' 시 스캔 자체 skip.
 */

import { prisma } from '@/lib/prisma'
import { getBot } from '@/bot/index'
import { sendHtml, escapeHtml } from '@/bot/utils/telegram'
import { generateTAReport } from '@/lib/ta/engine'
import type { TAReport } from '@/lib/ta/types'
import { getEarningsMany } from '@/lib/earnings/cache'
import {
  computeDeliveryStatus,
  recordAlertHistory,
  type AlertEventInput,
} from './alert-history'
import { buildCustomStrategyContext } from '@/lib/alert-history/context'
import {
  evaluateStrategy,
  requiresTA,
  requiresTAForCrossTickers,
  collectCrossTickers,
  buildCrossTickerSnapshot,
  type CrossTickerSnapshot,
  type MarketSnapshot,
} from '@/lib/custom-strategy/evaluator'
import {
  conditionToString,
  validateCondition,
  type Condition,
} from '@/lib/custom-strategy/types'

const CUSTOM_STRATEGY_ALERTS_KEY = 'custom_strategy_alerts'
const CUSTOM_STRATEGY_ALERTS_LABEL = '커스텀 전략 알림 (on/off)'

/** 봇 시작 시 row 존재 보장 (배포 후 UI 에서 설정 가능하도록) */
export async function ensureCustomStrategyAlertsSetting(): Promise<void> {
  try {
    await prisma.alertConfig.upsert({
      where: { key: CUSTOM_STRATEGY_ALERTS_KEY },
      update: {},
      create: {
        key: CUSTOM_STRATEGY_ALERTS_KEY,
        value: 'on',
        label: CUSTOM_STRATEGY_ALERTS_LABEL,
      },
    })
  } catch (error) {
    console.error('[custom-strategy] custom_strategy_alerts 설정 초기화 실패:', error)
  }
}

async function isCustomStrategyAlertsEnabled(): Promise<boolean> {
  const config = await prisma.alertConfig.upsert({
    where: { key: CUSTOM_STRATEGY_ALERTS_KEY },
    update: {},
    create: {
      key: CUSTOM_STRATEGY_ALERTS_KEY,
      value: 'on',
      label: CUSTOM_STRATEGY_ALERTS_LABEL,
    },
  })
  return config.value.toLowerCase() !== 'off'
}

/** KST 오늘 date string (YYYY-MM-DD) */
function todayKST(): string {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

/** frequency 기반 dedup — 마지막 발동 시각 대비 알림 발송 가능 여부 */
function shouldFire(
  frequency: string,
  lastTriggeredAt: Date | null,
  now: Date,
): boolean {
  if (frequency === 'always') return true
  if (!lastTriggeredAt) return true

  if (frequency === 'once') return false // 이미 한번 발동 → 종료

  if (frequency === 'daily') {
    // KST 기준 같은 날이면 skip
    const last = new Date(lastTriggeredAt.getTime() + 9 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    const today = new Date(now.getTime() + 9 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    return last !== today
  }

  return true
}

/**
 * 동시 실행 방지 mutex — cron 이 10 분마다 fire-and-forget 로 호출하므로,
 * TA 리포트 fetch 지연 등으로 이전 스캔이 진행 중이면 중복 알림 발송을 차단해야 함.
 */
let scanRunning = false

/**
 * 활성 커스텀 전략을 모두 스캔 → 만족 조건 텔레그램 발송.
 * refreshPrices() 직후 호출.
 */
export async function checkCustomStrategies(chatIds: number[]): Promise<void> {
  if (chatIds.length === 0) return

  if (scanRunning) {
    console.warn('[custom-strategy] 이전 스캔 진행 중, 건너뜀')
    return
  }
  scanRunning = true
  try {
    await runScan(chatIds)
  } finally {
    scanRunning = false
  }
}

async function runScan(chatIds: number[]): Promise<void> {
  if (!(await isCustomStrategyAlertsEnabled())) return

  // 봇 초기화 실패 시 DB 상태 갱신 전에 fail-fast — "발동 기록만 남고 발송은 안 됨" 방지
  const bot = getBot()

  const strategies = await prisma.customStrategy.findMany({
    where: { isActive: true },
  })
  if (strategies.length === 0) return

  // Phase 34-B (#420) / Phase 38-A (#448):
  // 전략들이 참조하는 크로스 티커까지 통합 조회 + TA 필요 시 TA 리포트도 함께.
  const strategyTickers = Array.from(new Set(strategies.map((s) => s.ticker)))
  const crossSet = collectCrossTickers(strategies)
  const allPriceTickers = Array.from(new Set([...strategyTickers, ...crossSet]))
  const prices = await prisma.priceCache.findMany({
    where: { ticker: { in: allPriceTickers } },
  })
  const priceMap = new Map(prices.map((p) => [p.ticker, p]))

  // 보유 티커 조회 — holding_status 조건 평가용 (Phase 31-A v2).
  // shares > 0 만 홀딩으로 간주. 여러 계좌에서 같은 티커 보유해도 Set 이므로 중복 무관.
  const holdingRows = await prisma.holding.findMany({
    where: { shares: { gt: 0 } },
    select: { ticker: true },
  })
  const holdings = new Set(holdingRows.map((h) => h.ticker))

  // Phase 34-A (#419): 어닝 캐시 (전략 전체 티커 대상 미리 조회).
  // 캐시 없으면 evaluator 가 자동으로 false 처리 → 안전.
  const earningsMap = await getEarningsMany(strategyTickers)

  // Phase 38-A (#448): TA 필요 티커를 자기 + 크로스 티커 모두 합집합으로 수집 → 중복 fetch 방지.
  // 크로스 티커가 다른 전략의 자기 티커와 동일할 수 있어 Set dedupe 필수.
  const tickersNeedingTA = new Set<string>()
  for (const s of strategies) {
    const raw = Array.isArray(s.conditions) ? (s.conditions as unknown[]) : []
    const conds = raw.filter(validateCondition) as Condition[]
    if (conds.length === 0) continue
    if (requiresTA(conds)) tickersNeedingTA.add(s.ticker)
    for (const t of requiresTAForCrossTickers(conds)) {
      tickersNeedingTA.add(t)
    }
  }

  // TA 리포트 병렬 fetch (실패는 null 로 기록해 조건 evaluator 가 false 처리하도록).
  const taByTicker = new Map<string, TAReport | null>()
  await Promise.all(
    Array.from(tickersNeedingTA).map(async (ticker) => {
      try {
        const report = await generateTAReport(ticker)
        taByTicker.set(ticker, report)
      } catch (error) {
        console.error(`[custom-strategy] TA 리포트 실패 (${ticker}):`, error)
        taByTicker.set(ticker, null)
      }
    }),
  )

  // 크로스 티커 스냅샷 구성 — price + (있으면) TA 병합. TA 없는 티커도 price 조건은 여전히 평가 가능.
  const crossTickersMap = new Map<string, CrossTickerSnapshot>()
  for (const t of crossSet) {
    const p = priceMap.get(t)
    if (!p) continue
    const ta = taByTicker.get(t) ?? null
    crossTickersMap.set(t, buildCrossTickerSnapshot({ price: p.price, changePercent: p.changePercent }, ta))
  }

  const now = new Date()
  const alerts: string[] = []
  const historyEvents: AlertEventInput[] = []
  const firedIds: string[] = []
  const disableIds: string[] = [] // frequency=once + 발동 → 자동 비활성화

  for (const s of strategies) {
    const rawConds = Array.isArray(s.conditions) ? (s.conditions as unknown[]) : []
    // 스키마 방어 — DB 조작 등으로 손상됐을 수 있음
    if (!rawConds.every(validateCondition)) {
      console.warn(`[custom-strategy] 손상된 조건 skip: ${s.id}`)
      continue
    }
    const conds = rawConds as Condition[]

    if (!shouldFire(s.frequency, s.lastTriggeredAt, now)) continue

    const priceRow = priceMap.get(s.ticker)
    const earningsRow = earningsMap.get(s.ticker)
    const snapshot: MarketSnapshot = {
      price: priceRow
        ? { price: priceRow.price, changePercent: priceRow.changePercent }
        : null,
      ta: taByTicker.get(s.ticker) ?? null,
      earnings: earningsRow ? { nextEarningsDate: earningsRow.nextEarningsDate } : null,
    }

    const { satisfied, perCondition } = evaluateStrategy(
      conds,
      s.logic === 'OR' ? 'OR' : 'AND',
      snapshot,
      { now, holdings, strategyTicker: s.ticker, crossTickers: crossTickersMap },
    )

    if (!satisfied) continue

    firedIds.push(s.id)
    if (s.frequency === 'once') disableIds.push(s.id)

    const condLines = perCondition
      .map((p) => `  ${p.result ? '✅' : '❌'} ${conditionToString(p.condition)}`)
      .join('\n')

    const priceLabel = priceRow
      ? `${priceRow.price.toLocaleString('ko-KR')} ${priceRow.currency}`
      : '(가격 미확인)'

    const alertBlock =
      `🎯 <b>${escapeHtml(s.name)}</b> (${escapeHtml(s.ticker)})\n` +
      `현재가: ${escapeHtml(priceLabel)}\n` +
      `${escapeHtml('조건 (' + s.logic + ') 만족:')}\n${escapeHtml(condLines)}`
    alerts.push(alertBlock)

    // 이력용 — HTML 태그 없이 이력 페이지에서 보기 편한 요약.
    // Phase 37-A (#444): evaluator 결과와 스냅샷을 contextJson 으로 저장 →
    // 상세 모달에서 어느 조건이 만족/미달이었는지 재현 가능.
    const taReport = taByTicker.get(s.ticker) ?? null
    historyEvents.push({
      kind: 'custom_strategy',
      ticker: s.ticker,
      price: priceRow?.price ?? null,
      changePercent: priceRow?.changePercent ?? null,
      message: `${s.name} (${s.ticker}) — ${s.logic} 조건 만족`,
      context: buildCustomStrategyContext({
        strategyId: s.id,
        strategyName: s.name,
        strategyTicker: s.ticker,
        logic: s.logic === 'OR' ? 'OR' : 'AND',
        conditions: conds,
        perCondition,
        snapshot: {
          price: priceRow?.price ?? null,
          changePercent: priceRow?.changePercent ?? null,
          // Codex #462 P2: `??` 는 NaN 을 null 로 fallback 하지 않음 (NaN 은 non-null).
          // TA 엔진이 짧은 데이터로 NaN 반환하면 그대로 JSON 저장 → Prisma createMany 가
          // 전체 batch 를 reject → 발송된 alert 가 이력 저장 실패. buildTaContext 와
          // 동일한 `Number.isFinite` 정규화로 방어.
          rsi: Number.isFinite(taReport?.indicators.rsi14.value) ? taReport!.indicators.rsi14.value : null,
          macdCrossover: taReport?.indicators.macd.crossover ?? null,
          bbPosition: taReport?.indicators.bollingerBands.position ?? null,
        },
      }),
    })
  }

  if (alerts.length === 0) return

  // 최소 1개 chatId 에 발송 성공한 뒤에만 DB 상태 갱신 — 실패 시 다음 tick 에서 재시도.
  const message = `🧠 <b>커스텀 전략 발동</b> (${todayKST()})\n\n${alerts.join('\n\n')}`
  let sentCount = 0
  let lastError: string | undefined
  for (const chatId of chatIds) {
    try {
      await sendHtml(bot, chatId, message)
      sentCount++
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      console.error(`[custom-strategy] 알림 발송 실패 (chatId: ${chatId}):`, error)
    }
  }

  // Phase 33-A (#416): 발동 이력 저장 (발송 성공 여부와 무관 — 실패도 partial/failed 로 기록).
  const status = computeDeliveryStatus(sentCount, chatIds.length)
  await recordAlertHistory(historyEvents, status, chatIds.length, status === 'sent' ? undefined : lastError)

  if (sentCount === 0) {
    console.warn('[custom-strategy] 전체 chatId 발송 실패 — DB 상태 갱신 보류 (다음 tick 재시도)')
    return
  }

  if (firedIds.length > 0) {
    await prisma.customStrategy.updateMany({
      where: { id: { in: firedIds } },
      data: { lastTriggeredAt: now },
    })
  }
  if (disableIds.length > 0) {
    await prisma.customStrategy.updateMany({
      where: { id: { in: disableIds } },
      data: { isActive: false },
    })
  }

  console.log(`[custom-strategy] 알림 발송: ${alerts.length}건 → ${sentCount}/${chatIds.length} chats`)
}
