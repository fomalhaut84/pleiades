/**
 * Phase 37-B (#445) — CSV export 포맷 pure 함수 회귀 테스트.
 *
 * 테스트 대상:
 *   - formatKstDateTime: UTC → KST 벽시계 문자열
 *   - stripHtmlForCsv: HTML 태그 제거
 *   - summarizeContext: kind 별 필드 요약 + retriedFrom 마커
 *   - toCsvRow: Prisma row → 헤더 순서와 정합
 *   - buildExportFilename: KST 날짜 포함
 *   - toCSV 통합: RFC 4180 escape + 수식 주입 방어
 */

import { describe, expect, it } from 'vitest'
import {
  formatKstDateTime,
  stripHtmlForCsv,
  messageForCsv,
  summarizeContext,
  toCsvRow,
  buildExportFilename,
  HISTORY_CSV_HEADERS,
} from '../csv-format'
import { toCSV } from '@/lib/csv'

describe('formatKstDateTime', () => {
  it('UTC 00:00 → KST 09:00 (같은 날)', () => {
    // 2026-07-08 00:00 UTC = 2026-07-08 09:00 KST
    expect(formatKstDateTime('2026-07-08T00:00:00Z')).toBe('2026-07-08 09:00:00')
  })

  it('UTC 15:00 → KST 다음날 00:00 (달 넘김 없음)', () => {
    expect(formatKstDateTime('2026-07-08T15:00:00Z')).toBe('2026-07-09 00:00:00')
  })

  it('Date 인스턴스도 처리', () => {
    const d = new Date('2026-07-08T00:00:00Z')
    expect(formatKstDateTime(d)).toBe('2026-07-08 09:00:00')
  })

  it('잘못된 값은 빈 문자열', () => {
    expect(formatKstDateTime('not-a-date')).toBe('')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(formatKstDateTime(new Date('invalid') as any)).toBe('')
  })

  it('zero-pad — 한자리 시/분/초를 항상 2자리로', () => {
    // UTC 00:00:05 → KST 09:00:05
    expect(formatKstDateTime('2026-01-02T00:00:05Z')).toBe('2026-01-02 09:00:05')
  })
})

describe('messageForCsv (Codex #462 P2)', () => {
  it('pre-escaped kind (target_hit): entity decode', () => {
    expect(messageForCsv('A &amp; B', 'target_hit')).toBe('A & B')
    expect(messageForCsv('&lt;100&gt;', 'stop_loss')).toBe('<100>')
    expect(messageForCsv('&quot;x&quot;', 'watch_buy')).toBe('"x"')
    expect(messageForCsv('&#39;y&#39;', 'watch_zone')).toBe("'y'")
  })

  it('raw kind (custom_strategy): message 그대로', () => {
    expect(messageForCsv('SOXL < 40 > RSI', 'custom_strategy')).toBe('SOXL < 40 > RSI')
    // 사용자가 literal `&amp;` 를 이름에 넣어도 decode 하지 않음
    expect(messageForCsv('A &amp; B', 'custom_strategy')).toBe('A &amp; B')
  })

  it('raw kind (drop/surge/fx/ta_signal): 그대로', () => {
    for (const kind of ['drop', 'surge', 'fx', 'ta_signal']) {
      expect(messageForCsv('SOXL < 40', kind)).toBe('SOXL < 40')
    }
  })
})

describe('stripHtmlForCsv (@deprecated Codex #462 P2)', () => {
  it('간단한 태그 제거', () => {
    expect(stripHtmlForCsv('<b>AAPL</b> 급락')).toBe('AAPL 급락')
  })

  it('중첩 태그도 처리', () => {
    expect(stripHtmlForCsv('<div><span>hi</span></div>')).toBe('hi')
  })

  it('속성 포함 태그', () => {
    expect(stripHtmlForCsv('<a href="x">link</a>')).toBe('link')
  })

  it('태그 없는 문자열은 그대로', () => {
    expect(stripHtmlForCsv('plain text')).toBe('plain text')
  })
})

describe('summarizeContext', () => {
  it('null/undefined → 빈 문자열', () => {
    expect(summarizeContext(null)).toBe('')
    expect(summarizeContext(undefined)).toBe('')
  })

  it('non-object primitive → String() 변환', () => {
    expect(summarizeContext('scalar')).toBe('scalar')
    expect(summarizeContext(42)).toBe('42')
  })

  it('price alert context — 주요 필드 요약', () => {
    const s = summarizeContext({
      type: 'drop', price: 150, changePercent: -6.2, threshold: -5, marketOpen: true,
    })
    expect(s).toContain('type=drop')
    expect(s).toContain('price=150')
    expect(s).toContain('Δ%=-6.2')
    expect(s).toContain('threshold=-5')
    expect(s).toContain('marketOpen=true')
  })

  it('fx context — rate 필드 요약', () => {
    const s = summarizeContext({ type: 'fx', rate: 1330, changeKrw: 55, changePercent: 4.3 })
    expect(s).toContain('type=fx')
    expect(s).toContain('rate=1330')
    expect(s).toContain('Δ%=4.3')
  })

  it('ta_signal context — 지표/시그널 배열 파이프 조인', () => {
    const s = summarizeContext({
      type: 'ta_signal',
      price: 150, changePercent: 1, rsi: 32, macdCrossover: 'GOLDEN', bbPosition: 'BELOW_LOWER',
      overall: 'BUY',
      signals: ['RSI_OVERSOLD', 'MACD_GOLDEN'],
    })
    expect(s).toContain('type=ta_signal')
    expect(s).toContain('rsi=32')
    expect(s).toContain('macd=GOLDEN')
    expect(s).toContain('bb=BELOW_LOWER')
    expect(s).toContain('overall=BUY')
    expect(s).toContain('signals=RSI_OVERSOLD|MACD_GOLDEN')
  })

  it('custom_strategy context — strategyId/Name 요약', () => {
    const s = summarizeContext({
      type: 'custom_strategy', strategyId: 's1', strategyName: '테스트',
      logic: 'AND', conditions: [], perCondition: [],
    })
    expect(s).toContain('type=custom_strategy')
    expect(s).toContain('strategyId=s1')
    expect(s).toContain('strategy=테스트')
  })

  it('retriedFrom 마커 포함 (재발송 이력 식별)', () => {
    const s = summarizeContext({
      type: 'drop', price: 100, changePercent: -3, marketOpen: true, retriedFrom: 'orig-id-123',
    })
    expect(s).toContain('retriedFrom=orig-id-123')
  })

  it('알 수 없는 shape → JSON stringify fallback', () => {
    const s = summarizeContext({ foo: 'bar', nested: { a: 1 } })
    // type/price/rsi 등 whitelist 필드가 없으면 parts 가 비어 JSON.stringify 로 대체
    expect(s).toBe(JSON.stringify({ foo: 'bar', nested: { a: 1 } }))
  })

  it('changePercent 등 0 값도 표시 (falsy 체크 실수 방지)', () => {
    const s = summarizeContext({ type: 'drop', price: 100, changePercent: 0, threshold: 0, marketOpen: false })
    // 0 은 null 이 아니므로 반드시 포함
    expect(s).toContain('Δ%=0')
    expect(s).toContain('threshold=0')
    expect(s).toContain('marketOpen=false')
  })
})

describe('toCsvRow', () => {
  it('전체 필드 셀 순서가 HISTORY_CSV_HEADERS 와 일치', () => {
    const row = toCsvRow({
      firedAt: new Date('2026-07-08T00:00:00Z'),
      kind: 'drop',
      ticker: 'AAPL',
      price: 150.5,
      changePercent: -6.2,
      // raw stored message (drop 은 raw kind — HTML 태그 없음).
      message: '🔴 AAPL (AAPL) 급락: -6.2%',
      deliveryStatus: 'sent',
      recipientCount: 2,
      errorMessage: null,
      contextJson: { type: 'drop', price: 150.5, changePercent: -6.2, marketOpen: true },
    })
    expect(row).toHaveLength(HISTORY_CSV_HEADERS.length)
    expect(row[0]).toBe('2026-07-08 09:00:00')  // firedAt (KST)
    expect(row[1]).toBe('drop')                  // kind
    expect(row[2]).toBe('AAPL')                  // ticker
    expect(row[3]).toBe('150.5')                 // price
    expect(row[4]).toBe('-6.2')                  // changePercent
    expect(row[5]).toBe('🔴 AAPL (AAPL) 급락: -6.2%')  // message (raw preserved)
    expect(row[6]).toBe('sent')                  // deliveryStatus
    expect(row[7]).toBe('2')                     // recipientCount
    expect(row[8]).toBe('')                      // errorMessage (null → '')
    expect(row[9]).toContain('type=drop')        // context summary
  })

  // Codex #462 P2 회귀 방지 — raw kind (custom_strategy) 의 이름에 `<` `>` 가
  // 포함되면 이전 stripHtmlForCsv 는 `< 40 >` 을 태그로 오해석해 삭제 → audit CSV
  // 손상. 이제 messageForCsv 는 raw kind 를 그대로 보존.
  it('raw kind (custom_strategy) 의 `<...>` 텍스트는 preserve', () => {
    const row = toCsvRow({
      firedAt: new Date('2026-07-08T00:00:00Z'),
      kind: 'custom_strategy',
      ticker: 'SOXL',
      price: 40,
      changePercent: 0,
      message: 'SOXL < 40 > RSI 30 이하 (SOXL) — AND 조건 만족',
      deliveryStatus: 'sent',
      recipientCount: 1,
      errorMessage: null,
      contextJson: null,
    })
    expect(row[5]).toBe('SOXL < 40 > RSI 30 이하 (SOXL) — AND 조건 만족')
  })

  // Codex #462 P2 회귀 방지 — pre-escaped kind (target_hit 등) 은 저장 시
  // `${escapeHtml(name)}` 로 build 됨. CSV 는 사람 읽기용이라 entity decode.
  it('pre-escaped kind (target_hit) 의 `&amp;` 는 CSV 에서 `&` 로 decode', () => {
    const row = toCsvRow({
      firedAt: new Date('2026-07-08T00:00:00Z'),
      kind: 'target_hit',
      ticker: 'AAPL',
      price: 200,
      changePercent: 1.0,
      message: '🎯 A &amp; B (AAPL) 목표가 도달: 200 (목표 &lt;200&gt;)',
      deliveryStatus: 'sent',
      recipientCount: 1,
      errorMessage: null,
      contextJson: null,
    })
    expect(row[5]).toBe('🎯 A & B (AAPL) 목표가 도달: 200 (목표 <200>)')
  })

  it('null 필드는 빈 문자열로', () => {
    const row = toCsvRow({
      firedAt: new Date('2026-07-08T00:00:00Z'),
      kind: 'fx', ticker: null, price: null, changePercent: null,
      message: 'x', deliveryStatus: 'failed', recipientCount: 0,
      errorMessage: '네트워크 오류', contextJson: null,
    })
    expect(row[2]).toBe('')  // ticker
    expect(row[3]).toBe('')  // price
    expect(row[4]).toBe('')  // changePercent
    expect(row[8]).toBe('네트워크 오류')
    expect(row[9]).toBe('')  // contextJson null
  })
})

describe('buildExportFilename', () => {
  it('KST 날짜 (YYYY-MM-DD) 포함', () => {
    const from = new Date('2026-07-01T00:00:00Z')
    const to = new Date('2026-07-14T00:00:00Z')
    // both times shift to KST → 2026-07-01, 2026-07-14
    expect(buildExportFilename(from, to)).toBe('alert-history_2026-07-01_2026-07-14.csv')
  })
})

describe('toCSV 통합 — RFC 4180 escape + 수식 주입 방어', () => {
  it('셀에 comma 포함 시 quote wrap', () => {
    const csv = toCSV(['a'], [['x,y']])
    expect(csv).toContain('"x,y"')
  })

  it('셀에 double-quote 포함 시 quote 이중화 + wrap', () => {
    const csv = toCSV(['a'], [['say "hi"']])
    expect(csv).toContain('"say ""hi"""')
  })

  it('셀에 newline 포함 시 quote wrap', () => {
    const csv = toCSV(['a'], [['line1\nline2']])
    expect(csv).toContain('"line1\nline2"')
  })

  it('셀이 =/+/-/@ 로 시작하면 앞에 apostrophe (수식 주입 방어)', () => {
    // context summary 는 "type=drop" 처럼 = 를 포함하지만 시작 문자는 't' → 안전
    // 반면 사용자 message 가 "=SUM(...)" 이면 위험
    const csv = toCSV(['a'], [['=SUM(A1:A10)']])
    expect(csv).toContain("'=SUM(A1:A10)")
  })

  it('실제 이력 row 를 CSV 로 직렬화해도 셀 개수/quote escape 정합', () => {
    const row = toCsvRow({
      firedAt: new Date('2026-07-08T00:00:00Z'),
      kind: 'drop', ticker: 'AAPL', price: 150, changePercent: -6.2,
      message: 'AAPL, INC. "급락" 알림\n두번째 줄',  // comma + quote + newline
      deliveryStatus: 'sent', recipientCount: 1,
      errorMessage: null,
      contextJson: { type: 'drop', price: 150, changePercent: -6.2, marketOpen: true },
    })
    const csv = toCSV([...HISTORY_CSV_HEADERS], [row])
    // message 셀은 quote wrap + 내부 quote 이중화 되어야 함 (RFC 4180).
    // naive split('\n') 은 quote 안 newline 도 자르므로 line 개수 대신 escape 문자열로 검증.
    expect(csv).toContain('"AAPL, INC. ""급락"" 알림\n두번째 줄"')
    // 헤더 행이 정상 렌더링되었는지 (헤더는 special char 없어 quote 없이 join)
    expect(csv).toContain(HISTORY_CSV_HEADERS.join(','))
  })
})
