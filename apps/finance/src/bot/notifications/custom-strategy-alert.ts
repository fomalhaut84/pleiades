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
import {
  evaluateStrategy,
  requiresTA,
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

  // ticker 단위로 PriceCache 미리 조회
  const tickers = Array.from(new Set(strategies.map((s) => s.ticker)))
  const prices = await prisma.priceCache.findMany({
    where: { ticker: { in: tickers } },
  })
  const priceMap = new Map(prices.map((p) => [p.ticker, p]))

  // TA 필요한 ticker 만 리포트 생성 (병렬 + 실패 허용)
  const taByTicker = new Map<string, TAReport | null>()

  // 어느 티커에 TA 가 필요한지 그루핑
  const tickersNeedingTA = new Set<string>()
  for (const s of strategies) {
    const raw = Array.isArray(s.conditions) ? (s.conditions as unknown[]) : []
    const conds = raw.filter(validateCondition)
    if (conds.length === 0) continue
    if (requiresTA(conds)) tickersNeedingTA.add(s.ticker)
  }

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

  const now = new Date()
  const alerts: string[] = []
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
    const snapshot: MarketSnapshot = {
      price: priceRow
        ? { price: priceRow.price, changePercent: priceRow.changePercent }
        : null,
      ta: taByTicker.get(s.ticker) ?? null,
    }

    const { satisfied, perCondition } = evaluateStrategy(
      conds,
      s.logic === 'OR' ? 'OR' : 'AND',
      snapshot,
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

    alerts.push(
      `🎯 <b>${escapeHtml(s.name)}</b> (${escapeHtml(s.ticker)})\n` +
        `현재가: ${escapeHtml(priceLabel)}\n` +
        `${escapeHtml('조건 (' + s.logic + ') 만족:')}\n${escapeHtml(condLines)}`,
    )
  }

  if (alerts.length === 0) return

  // 최소 1개 chatId 에 발송 성공한 뒤에만 DB 상태 갱신 — 실패 시 다음 tick 에서 재시도.
  const message = `🧠 <b>커스텀 전략 발동</b> (${todayKST()})\n\n${alerts.join('\n\n')}`
  let sentCount = 0
  for (const chatId of chatIds) {
    try {
      await sendHtml(bot, chatId, message)
      sentCount++
    } catch (error) {
      console.error(`[custom-strategy] 알림 발송 실패 (chatId: ${chatId}):`, error)
    }
  }

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
