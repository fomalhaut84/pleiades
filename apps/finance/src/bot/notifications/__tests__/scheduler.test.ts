/**
 * pleiades#143 (PR #144 Codex P2) — 수신자가 0 이어도 스케줄은 등록하고, 실행 때마다 수신자를 확인한다.
 * 루트 .env(Discord)를 나중에 채우면 재시작 없이 다음 실행부터 반영돼야 한다.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }))
vi.mock('@/lib/prisma', () => ({ prisma: { alertConfig: { findUnique: vi.fn(async () => null) } } }))
vi.mock('../quarterly', () => ({ sendQuarterlyReminder: vi.fn() }))
vi.mock('../rsu', () => ({ sendRSUReminders: vi.fn(), sendRSUVestConfirmations: vi.fn() }))
vi.mock('../active-review', () => ({
  sendClosingReview: vi.fn(),
  sendWeeklyReview: vi.fn(),
  ensureActiveReviewSetting: vi.fn(async () => {}),
}))
vi.mock('../custom-strategy-alert', () => ({ ensureCustomStrategyAlertsSetting: vi.fn(async () => {}) }))
vi.mock('../ta-signal-alert', () => ({ ensureTaAiGuideSetting: vi.fn(async () => {}) }))
vi.mock('../price-alert', () => ({ ensureWatchlistMarketHoursOnlySetting: vi.fn(async () => {}) }))
vi.mock('../monthly', () => ({ sendMonthlyReminder: vi.fn() }))
vi.mock('../daily', () => ({ sendDailySummary: vi.fn() }))
vi.mock('../monthly-report', () => ({ sendMonthlyReport: vi.fn() }))
vi.mock('../briefing', () => ({ sendBriefing: vi.fn() }))
vi.mock('../networth-snapshot', () => ({ takeNetWorthSnapshot: vi.fn() }))
vi.mock('../quarterly-report', () => ({ sendQuarterlyReport: vi.fn() }))

import cron from 'node-cron'
import { sendRSUReminders, sendRSUVestConfirmations } from '../rsu'

describe('scheduleNotifications — 수신자 확인은 실행 시점에', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mocked(cron.schedule).mockClear()
    vi.mocked(sendRSUReminders).mockClear()
    vi.mocked(sendRSUVestConfirmations).mockClear()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '1:x')
    vi.stubEnv('TELEGRAM_ALLOWED_CHAT_IDS', '')
    vi.stubEnv('NOTIFY_ALLOWED_CHANNEL', '')
    vi.stubEnv('DISCORD_WEBHOOK_FINANCE', '')
    vi.stubEnv('NOTIFY_INTERACTIVE_CHANNEL', '')
    vi.stubEnv('DISCORD_BOT_TOKEN_FINANCE', '')
    vi.stubEnv('DISCORD_CHANNEL_ID_FINANCE', '')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  async function registered() {
    const { scheduleNotifications } = await import('../scheduler')
    scheduleNotifications()
    const calls = vi.mocked(cron.schedule).mock.calls
    // RSU 리마인더(매일 09:00) 작업을 찾는다
    const rsu = calls.find((c) => c[0] === '0 9 * * *')
    expect(rsu).toBeDefined()
    return { count: calls.length, run: rsu![1] as unknown as () => Promise<void> }
  }

  it('수신자 0 으로 떠도 작업은 등록된다 — 실행 때 0 이면 건너뛴다', async () => {
    const { count, run } = await registered()
    expect(count).toBeGreaterThan(0)
    await run()
    expect(sendRSUReminders).not.toHaveBeenCalled()
  })

  it('나중에 Discord 웹훅을 채우면 재시작 없이 다음 실행부터 보낸다', async () => {
    const { run } = await registered()
    vi.stubEnv('NOTIFY_ALLOWED_CHANNEL', 'discord')
    vi.stubEnv('DISCORD_WEBHOOK_FINANCE', 'https://discord.com/api/webhooks/1/tok')
    await run()
    expect(sendRSUReminders).toHaveBeenCalledTimes(1)
  })

  // pleiades 009 D-1 (pleiades#349) — 토큰 게이트(E3)를 없애도 실행 판정과 전송이 같은 출처를 본다(E2)
  it('토큰 없음 — 알림 크론은 그대로 등록된다(게이트 제거)', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '')
    const { count } = await registered()
    expect(count).toBeGreaterThan(0)
  })

  // 회귀: 009 D-1 감사 [A]#5 — 토큰 없음 + chat ID 남음 + 라우트 텔레그램이면 생성 뒤 버리지 않고 아예 실행하지 않는다
  it('토큰 없음 + 텔레그램 chat ID 있음 + 라우트 텔레그램 — 실행하지 않는다(생성 호출 0)', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '')
    vi.stubEnv('TELEGRAM_ALLOWED_CHAT_IDS', '11')
    const { run } = await registered()
    await run()
    expect(sendRSUReminders).not.toHaveBeenCalled()
  })

  it('토큰 없음 + Discord 라우트 — 실행한다', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '')
    vi.stubEnv('NOTIFY_ALLOWED_CHANNEL', 'discord')
    vi.stubEnv('DISCORD_WEBHOOK_FINANCE', 'https://discord.com/api/webhooks/1/tok')
    const { run } = await registered()
    await run()
    expect(sendRSUReminders).toHaveBeenCalledTimes(1)
  })

  it('텔레그램 수신자만 있어도 실행한다 (키보드·PDF 는 텔레그램)', async () => {
    const { run } = await registered()
    vi.stubEnv('TELEGRAM_ALLOWED_CHAT_IDS', '11')
    await run()
    expect(sendRSUReminders).toHaveBeenCalledTimes(1)
  })

  // 회귀: PR #156 Codex P1 — 텍스트 수신자 0 · Discord 버튼만 설정해도 RSU D-day 확정 작업은 실행돼야 한다
  it('Discord 버튼만 설정 — RSU 확정(15:35)은 실행 · 텍스트 알림(09:00)은 건너뜀', async () => {
    const { scheduleNotifications } = await import('../scheduler')
    scheduleNotifications()
    const calls = vi.mocked(cron.schedule).mock.calls
    const confirm = calls.find((c) => c[0] === '35 15 * * *')![1] as unknown as () => Promise<void>
    const reminder = calls.find((c) => c[0] === '0 9 * * *')![1] as unknown as () => Promise<void>
    await confirm()
    expect(sendRSUVestConfirmations).not.toHaveBeenCalled()
    vi.stubEnv('NOTIFY_INTERACTIVE_CHANNEL', 'discord')
    vi.stubEnv('DISCORD_BOT_TOKEN_FINANCE', 'fake-token')
    vi.stubEnv('DISCORD_CHANNEL_ID_FINANCE', '123456789012345678')
    await confirm()
    expect(sendRSUVestConfirmations).toHaveBeenCalledTimes(1)
    await reminder()
    expect(sendRSUReminders).not.toHaveBeenCalled()
  })
})
