import { describe, expect, it } from 'vitest'
import { FIN_CARD_COLOR, GAIN_COLOR, LOSS_COLOR } from '@/bot/utils/card'
import { dailySummaryContent, optionReminderCard, rsuDdayContent, rsuReminderCard } from '../cards'

// 013 P3-b2 (#779) — 알림 카드: 위 한 줄 = 제목 + 핵심 숫자(F7) · 표는 행 목록(F8) · 색 = 청록 + 손익(F6)

describe('dailySummaryContent', () => {
  const base = {
    dateStr: '2026.11.18',
    total: 30_110_000,
    returnPct: 30.9,
    fxRate: 1400,
    accounts: [
      { name: '세진', value: 26_610_000, returnPct: 33, change: 120_000 },
      { name: 'a_b', value: 3_500_000, returnPct: -1.2 },
    ],
  }

  it('전일 대비가 있으면 위 한 줄에 · 카드 색 = 전일 대비 손익 · 계좌는 행 목록', () => {
    const c = dailySummaryContent({ ...base, change: { amount: -50_000, pct: -0.2 } })
    expect(c.format).toBe('plain')
    expect(c.text).toBe('📊 일일 포트폴리오 요약 (2026.11.18) · 총 ₩3,011만 (+30.9%) · 전일 -₩5만 (-0.2%)')
    expect(c.cards).toHaveLength(1)
    const [card] = c.cards!
    expect(card.title).toBe('계좌별')
    expect(card.color).toBe(LOSS_COLOR)
    expect(card.descriptionFormat).toBe('markdown')
    expect(card.description).toBe('• **💼 세진** — ₩2,661만 · +33.0% · 전일 +₩12만 🟢\n• **📁 a\\_b** — ₩350만 · -1.2%')
    expect(card.footer).toBe('환율 1,400원/달러')
  })

  it('전일 데이터가 없으면 위 한 줄은 총액만 · 색은 앱 색', () => {
    const c = dailySummaryContent(base)
    expect(c.text).toBe('📊 일일 포트폴리오 요약 (2026.11.18) · 총 ₩3,011만 (+30.9%)')
    expect(c.cards![0].color).toBe(FIN_CARD_COLOR)
  })

  it('계좌가 없으면 안내 카드', () => {
    expect(dailySummaryContent({ ...base, accounts: [] }).cards![0].description).toBe('계좌가 없습니다.')
  })
})

describe('RSU · 스톡옵션 리마인더 카드', () => {
  it('RSU D-1 — 항목 행 · 꼬리말 안내 · 앱 색', () => {
    expect(
      rsuReminderCard({ daysLeft: 1, accountName: '세진', shares: 10, vestingDate: '2026-11-19', basisValue: 1_500_000 }),
    ).toEqual({
      title: '⚠️ D-1 RSU 베스팅',
      description: '• **계좌** — 세진\n• **주수** — 10주\n• **베스팅일** — 2026-11-19\n• **기준가** — ₩1,500,000',
      descriptionFormat: 'markdown',
      color: FIN_CARD_COLOR,
      footer: '내일 15:35 KST 이후 [확정] 알림 발송됨',
    })
  })

  it('RSU D-7 — 꼬리말 없음', () => {
    const card = rsuReminderCard({ daysLeft: 7, accountName: '세진', shares: 10, vestingDate: '2026-11-25', basisValue: 1 })
    expect(card.title).toBe('📅 D-7 RSU 베스팅')
    expect(card).not.toHaveProperty('footer')
  })

  it('스톡옵션 — 이름 escape', () => {
    const card = optionReminderCard({ daysLeft: 7, name: '옵션*1', shares: 100, strikePrice: 10_000, vestingDate: '2026-11-25' })
    expect(card.title).toBe('📅 D-7 스톡옵션 행사 가능')
    expect(card.description).toBe('• **종목** — 옵션\\*1\n• **주수** — 100주\n• **행사가** — ₩10,000\n• **행사 가능일** — 2026-11-25')
  })
})

describe('rsuDdayContent', () => {
  const rsu = { accountName: '세진', shares: 10, vestingDate: '2026-11-18', basisValue: 1_500_000 }

  it('종가 · 매도 예정 행 · 위 한 줄 = 제목 + 계좌 · 주수 · 버튼 그대로', () => {
    const buttons = [[{ label: '✅ 확정', action: 'vest:confirm:r1' }]]
    const c = rsuDdayContent({ ...rsu, price: { kind: 'ok', value: 151_234.6, source: 'yahoo' }, sellShares: 3, autoSell: true }, buttons)
    expect(c.text).toBe('🎯 D-day RSU 베스팅 — 오늘 처리 가능 · 세진 10주')
    expect(c.format).toBe('plain')
    expect(c.components).toBe(buttons)
    expect(c.cards![0].description).toBe(
      '• **계좌** — 세진\n• **주수** — 10주\n• **베스팅일** — 2026-11-18\n• **기준가** — ₩1,500,000\n' +
        '• **종가** — ₩151,235 (yahoo)\n• **매도 예정** — 3주 (autoSell=✓)',
    )
    expect(c.cards![0].footer).toBe('아래 [확정] 한 번 탭으로 BUY/SELL Trade + Holding 자동 반영됩니다.')
  })

  it.each([
    ['missing', '자동 조회 실패 — 웹에서 직접 처리'],
    ['error', '조회 실패'],
  ] as const)('종가 %s → 안내 문구 · 매도 없음', (kind, text) => {
    const c = rsuDdayContent({ ...rsu, price: { kind }, sellShares: 0, autoSell: false }, [])
    expect(c.cards![0].description).toContain(`• **종가** — ${text}`)
    expect(c.cards![0].description).toContain('• **매도 예정** — 없음 (autoSell=✗)')
  })
})
