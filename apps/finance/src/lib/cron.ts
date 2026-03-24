import cron from 'node-cron'
import { refreshPrices } from './price-fetcher'
import { takeAllSnapshots } from './performance/snapshot'
import { syncKrxStocks } from './krx-stocks'
import { prisma } from './prisma'
import { checkPriceAlerts } from '@/bot/notifications/price-alert'
import { calculateNextRunAt, type Frequency } from './recurring-utils'
import { sendToWhooing } from './whooing-webhook'

function getAllowedChatIds(): number[] {
  return (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => !isNaN(n))
}

/**
 * Cron 작업 mutex + 타임아웃 가드.
 * - 중복 실행 방지 (isRunning 플래그)
 * - 타임아웃 시 mutex 강제 해제 (stale lock 방지)
 */
function createCronGuard(label: string, timeoutMs: number) {
  let isRunning = false

  return async (task: () => Promise<void>): Promise<void> => {
    if (isRunning) {
      console.warn(`[cron] ${label} 이미 실행 중, 건너뜀`)
      return
    }
    isRunning = true

    const timer = setTimeout(() => {
      console.error(`[cron] ${label} 타임아웃 경고 (${timeoutMs / 1000}s 초과) — 작업 완료 대기 중`)
    }, timeoutMs)

    try {
      await task()
    } catch (error) {
      console.error(`[cron] ${label} 실패:`, error)
    } finally {
      clearTimeout(timer)
      isRunning = false
    }
  }
}

/** 현재 시각을 KST 기준으로 반환 (시, 분, 요일) */
function getKSTTime(): { h: number; m: number; day: number } {
  const now = new Date()
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }))
  return {
    h: kst.getHours(),
    m: kst.getMinutes(),
    day: kst.getDay(), // 0=Sun, 6=Sat
  }
}

/** 한국 주식시장 개장 여부 (09:00~15:30 KST, 평일) */
function isKRMarketOpen(): boolean {
  const { h, m, day } = getKSTTime()
  if (day === 0 || day === 6) return false
  const minutes = h * 60 + m
  return minutes >= 540 && minutes <= 930 // 09:00 ~ 15:30
}

/** 현재 미국 서머타임(EDT) 여부를 America/New_York 시간대로 판별 */
function isUSDST(): boolean {
  const now = new Date()
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }))
  const diffHours = (utc.getTime() - et.getTime()) / (1000 * 60 * 60)
  return Math.round(diffHours) === 4 // EDT=UTC-4, EST=UTC-5
}

/**
 * 미국 주식시장 개장 여부 (평일→익일, KST 기준)
 * - 서머타임(EDT): 22:30~05:00 KST
 * - 비서머타임(EST): 23:30~06:00 KST
 */
function isUSMarketOpen(): boolean {
  const { h, m, day } = getKSTTime()
  const minutes = h * 60 + m
  const dst = isUSDST()
  const openMin = dst ? 1350 : 1410   // 22:30 or 23:30
  const closeMin = dst ? 300 : 360    // 05:00 or 06:00

  // 저녁 세션: openMin~23:59 (월~금)
  if (day >= 1 && day <= 5 && minutes >= openMin) return true
  // 새벽 세션: 00:00~closeMin (화~토 = 월~금 야간)
  if (day >= 2 && day <= 6 && minutes <= closeMin) return true

  return false
}

/**
 * 주가 갱신 스케줄러 등록.
 * 매 10분마다 실행, 장중이면 갱신, 장외에는 정각(매시 0분)에만 갱신.
 * 중복 실행 방지는 refreshPrices() 내부 mutex에서 처리.
 */
export function schedulePriceUpdates(): void {
  cron.schedule(
    '*/10 * * * *',
    async () => {
      const { m } = getKSTTime()
      const isMarketHours = isKRMarketOpen() || isUSMarketOpen()
      const isTopOfHour = m < 10 // 매시 0~9분 구간

      if (isMarketHours || isTopOfHour) {
        try {
          const result = await refreshPrices()
          // 실제 갱신이 발생한 경우에만 알림 체크
          if (result.success > 0) {
            const chatIds = getAllowedChatIds()
            if (chatIds.length > 0) {
              await checkPriceAlerts(chatIds)
            }
          }
        } catch (error) {
          console.error('[cron] Price refresh failed:', error)
        }
      }
    },
    { timezone: 'Asia/Seoul' }
  )

  console.log('[cron] 주가 스케줄러 등록 (장중 10분 / 장외 1시간)')
}

/**
 * 일일 포트폴리오 스냅샷 스케줄러.
 * 매일 06:05 KST (월~토) 실행. 미국장 종료 후 최신가 반영.
 */
export function scheduleSnapshots(): void {
  const guard = createCronGuard('스냅샷', 10 * 60 * 1000)

  cron.schedule(
    '5 6 * * 1-6',
    () => { void guard(async () => { await takeAllSnapshots() }) },
    { timezone: 'Asia/Seoul' }
  )

  console.log('[cron] 스냅샷 스케줄러 등록 (매일 06:05 KST, 월~토)')
}

/**
 * KRX 종목 리스트 동기화 스케줄러.
 * 매주 월요일 07:00 KST 실행.
 */
export function scheduleKrxSync(): void {
  const guard = createCronGuard('KRX 동기화', 5 * 60 * 1000)

  async function runSync(): Promise<void> {
    await guard(async () => {
      const result = await syncKrxStocks()
      console.log(
        `[cron] KRX 종목 동기화 완료: ${result.total}개 (추가 ${result.added}, 수정 ${result.updated}, 삭제 ${result.removed})`
      )
    })
  }

  // 주간 동기화 (매주 월 07:00 KST)
  cron.schedule('0 7 * * 1', () => { void runSync() }, { timezone: 'Asia/Seoul' })

  // 초기 데이터가 없으면 서버 시작 시 자동 동기화
  void (async () => {
    try {
      const count = await prisma.krxStock.count()
      if (count === 0) {
        console.log('[cron] KRX 종목 데이터 없음, 초기 동기화 시작...')
        await runSync()
      }
    } catch (error) {
      console.error('[cron] KRX 초기 동기화 실패:', error)
    }
  })()

  console.log('[cron] KRX 종목 동기화 스케줄러 등록 (매주 월 07:00 KST)')
}

/**
 * 반복 거래 자동 실행 스케줄러.
 * 매일 00:05 KST 실행. isActive=true AND nextRunAt <= now인 항목 처리.
 */
export function scheduleRecurring(): void {
  const guard = createCronGuard('반복거래', 5 * 60 * 1000)

  cron.schedule(
    '5 9 * * *',
    () => {
      void guard(async () => {
        const now = new Date()
        const items = await prisma.recurringTransaction.findMany({
          where: {
            isActive: true,
            nextRunAt: { lte: now },
          },
        })

        if (items.length === 0) return

        let created = 0
        for (const item of items) {
          try {
            // Transaction 생성 + nextRunAt 갱신을 트랜잭션으로 묶기
            const nextRun = calculateNextRunAt(
              item.frequency as Frequency,
              item.nextRunAt,
              item.dayOfMonth,
              item.dayOfWeek,
              item.monthOfYear,
            )

            const tx = await prisma.$transaction(async (db) => {
              const created = await db.transaction.create({
                data: {
                  amount: item.amount,
                  description: item.description,
                  categoryId: item.categoryId,
                  transactedAt: item.nextRunAt,
                },
              })
              await db.recurringTransaction.update({
                where: { id: item.id },
                data: { nextRunAt: nextRun, lastRunAt: now },
              })
              return created
            })

            // 후잉 웹훅 (트랜잭션 외부, 비차단)
            try {
              await sendToWhooing({
                amount: tx.amount,
                description: tx.description,
                categoryId: tx.categoryId,
                transactedAt: tx.transactedAt,
              })
            } catch (err) {
              console.error('[cron/recurring] 후잉 전송 실패:', err)
            }

            created++
          } catch (err) {
            console.error(`[cron/recurring] 항목 ${item.id} 처리 실패:`, err)
          }
        }

        if (created > 0) {
          console.log(`[cron] 반복 거래 ${created}건 자동 생성 완료`)
        }
      })
    },
    { timezone: 'Asia/Seoul' }
  )

  console.log('[cron] 반복 거래 스케줄러 등록 (매일 09:05 KST)')
}
