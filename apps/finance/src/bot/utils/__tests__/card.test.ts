import { describe, expect, it } from 'vitest'
import { FIN_CARD_COLOR, GAIN_COLOR, LOSS_COLOR, profitColor, rowListCard } from '../card'

// 013 P3-b1 (#777) — fin 카드: 행 목록(F8) · 앱 색 청록 + 손익만 덮기(F6)
describe('profitColor', () => {
  it('오르면 빨강 · 내리면 파랑 · 0 · NaN 은 앱 색', () => {
    expect(profitColor(1.2)).toBe(GAIN_COLOR)
    expect(profitColor(-0.01)).toBe(LOSS_COLOR)
    expect(profitColor(0)).toBe(FIN_CARD_COLOR)
    expect(profitColor(Number.NaN)).toBe(FIN_CARD_COLOR)
    expect(FIN_CARD_COLOR).toBe(0x0ca678)
  })
})

describe('rowListCard', () => {
  it('제목 · 행 목록(굵은 이름 · escape) · 기본 색 · 꼬리말', () => {
    expect(rowListCard('보유', [{ label: 'a_b', text: '10주' }], { footer: '환율 $1 = ₩1400.00' })).toEqual({
      title: '보유',
      description: '• **a\\_b** — 10주',
      descriptionFormat: 'markdown',
      color: FIN_CARD_COLOR,
      footer: '환율 $1 = ₩1400.00',
    })
  })

  it('행이 없으면 빈 안내(plain) — 빈 카드를 만들지 않는다', () => {
    expect(rowListCard('보유', [], { empty: '보유 종목이 없습니다.', color: LOSS_COLOR })).toEqual({
      title: '보유',
      description: '보유 종목이 없습니다.',
      color: LOSS_COLOR,
    })
  })
})
