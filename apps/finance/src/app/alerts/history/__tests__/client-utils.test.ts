import { describe, expect, it } from 'vitest'
import { periodFromISO, formatFiredAt, stripHtml, messageForDisplay } from '../client-utils'

describe('periodFromISO', () => {
  it('N일 전 시각을 ISO 8601 로 반환 (now 주입)', () => {
    const now = Date.parse('2026-07-08T00:00:00Z')
    expect(periodFromISO(7, now)).toBe('2026-07-01T00:00:00.000Z')
    expect(periodFromISO(30, now)).toBe('2026-06-08T00:00:00.000Z')
    expect(periodFromISO(0, now)).toBe('2026-07-08T00:00:00.000Z')
  })
})

describe('formatFiredAt', () => {
  it('UTC ISO → KST MM-DD HH:mm', () => {
    // UTC 00:00:00 = KST 09:00
    expect(formatFiredAt('2026-07-08T00:00:00Z')).toBe('07-08 09:00')
  })

  it('자정 넘김 (UTC 15:30 → KST 다음날 00:30)', () => {
    expect(formatFiredAt('2026-07-08T15:30:00Z')).toBe('07-09 00:30')
  })
})

describe('stripHtml', () => {
  it('<b> 태그 제거', () => {
    expect(stripHtml('🔴 <b>AAPL</b> 급락')).toBe('🔴 AAPL 급락')
  })

  it('<br> 는 개행으로 변환', () => {
    expect(stripHtml('a<br>b<br/>c')).toBe('a\nb\nc')
  })

  it('HTML 엔티티 역디코드 (escapeHtml 결과 원상복원)', () => {
    expect(stripHtml('&amp; &lt;script&gt; &quot;x&quot; &#39;y&#39;')).toBe(`& <script> "x" 'y'`)
  })

  it('중첩 태그와 속성 모두 제거', () => {
    expect(stripHtml('<b>hello <i class="x">world</i></b>')).toBe('hello world')
  })

  it('평문은 변경 없음', () => {
    expect(stripHtml('안녕하세요')).toBe('안녕하세요')
  })
})

// Codex #462 P2 회귀 방지 — kind gating 으로 raw kind 의 `<...>` 이름 보존.
describe('messageForDisplay', () => {
  it('pre-escaped kind (target_hit 등) → stripHtml 적용', () => {
    expect(messageForDisplay('🎯 <b>A &amp; B</b>', 'target_hit')).toBe('🎯 A & B')
    expect(messageForDisplay('&lt;100&gt;', 'stop_loss')).toBe('<100>')
    expect(messageForDisplay('<b>x</b>', 'watch_buy')).toBe('x')
    expect(messageForDisplay('<b>y</b>', 'watch_zone')).toBe('y')
  })

  it('raw kind (custom_strategy) → 사용자 이름의 `< 40 >` 텍스트 preserve', () => {
    expect(messageForDisplay('SOXL < 40 > RSI 30 이하', 'custom_strategy'))
      .toBe('SOXL < 40 > RSI 30 이하')
    // literal `&amp;` 도 decode 하지 않음
    expect(messageForDisplay('A &amp; B 전략', 'custom_strategy'))
      .toBe('A &amp; B 전략')
  })

  it('raw kind (drop/surge/fx/ta_signal) → 그대로', () => {
    for (const kind of ['drop', 'surge', 'fx', 'ta_signal']) {
      expect(messageForDisplay('SOXL < 40', kind)).toBe('SOXL < 40')
    }
  })
})
