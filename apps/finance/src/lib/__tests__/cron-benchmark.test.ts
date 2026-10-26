/**
 * 회귀: pleiades#261 — 벤치마크 시세를 채우는 경로가 웹 backfill 버튼뿐이라 시세가
 * 2026-06-01 에서 멈췄고, 주간 리뷰(1M TWR)의 알파가 빠졌다. 일일 적재 크론을 더한다.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }))
vi.mock('../prisma', () => ({ prisma: {} }))
vi.mock('../price-fetcher', () => ({ refreshPrices: vi.fn() }))
vi.mock('../performance/snapshot', () => ({ takeAllSnapshots: vi.fn() }))
vi.mock('../krx-stocks', () => ({ syncKrxStocks: vi.fn() }))
vi.mock('../performance/benchmark', () => ({ backfillAllBenchmarks: vi.fn() }))
vi.mock('@/bot/notifications/price-alert', () => ({ checkPriceAlerts: vi.fn() }))
vi.mock('@/bot/notifications/ta-signal-alert', () => ({ checkTASignals: vi.fn() }))
vi.mock('@/bot/notifications/custom-strategy-alert', () => ({ checkCustomStrategies: vi.fn() }))
vi.mock('@/bot/notifications/notifier', () => ({ recipients: vi.fn(() => []), Route: {} }))
vi.mock('../whooing-webhook', () => ({ sendToWhooing: vi.fn() }))

import cron from 'node-cron'
import { backfillAllBenchmarks } from '../performance/benchmark'
import { scheduleBenchmarkRefresh } from '../cron'

describe('scheduleBenchmarkRefresh', () => {
  beforeEach(() => {
    vi.mocked(cron.schedule).mockClear()
    vi.mocked(backfillAllBenchmarks).mockReset()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function registered() {
    scheduleBenchmarkRefresh()
    const calls = vi.mocked(cron.schedule).mock.calls
    expect(calls).toHaveLength(1)
    const [expression, task, options] = calls[0]
    return { expression, options, run: task as unknown as () => void }
  }

  /** guard 는 void 로 던지고 끝나므로 마이크로태스크를 비운다 */
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

  it('화~토 06:15 KST 에 등록한다 — 미국장 마감 뒤 · 토 09:00 주간 리뷰 전', () => {
    const { expression, options } = registered()
    expect(expression).toBe('15 6 * * 2-6')
    expect(options).toEqual({ timezone: 'Asia/Seoul' })
  })

  it('최근 1개월만 upsert 적재한다', async () => {
    vi.mocked(backfillAllBenchmarks).mockResolvedValue([{ ticker: '^GSPC', inserted: 21, skipped: 0 }])
    registered().run()
    await flush()
    expect(backfillAllBenchmarks).toHaveBeenCalledWith(1)
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[cron] 벤치마크 적재 완료: 1개 (^GSPC+21/0)'))
  })

  it('적재가 실패해도 예외가 크론 밖으로 새지 않고 실패 로그만 남는다', async () => {
    vi.mocked(backfillAllBenchmarks).mockRejectedValue(new Error('yahoo down'))
    const { run } = registered()
    expect(() => run()).not.toThrow()
    await flush()
    expect(console.error).toHaveBeenCalledWith('[cron] 벤치마크 적재 실패:', expect.any(Error))
  })

  it('봇 프로세스가 기동 때 등록한다', () => {
    const src = readFileSync(path.resolve(__dirname, '../../bot/standalone.ts'), 'utf-8')
    expect(src).toMatch(/^\s*scheduleBenchmarkRefresh\(\)/m)
  })
})
