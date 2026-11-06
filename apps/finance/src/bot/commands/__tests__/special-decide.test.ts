/**
 * pleiades 009 D-3 PR-2b (pleiades#394) — 특수 경로 판단 함수 계약(설계 §4 P · A2 · D · D2).
 *
 * 판단 흐름 전체는 `special-flow.test.ts` 가 고정한다(009 D-5 B3a). 여기서는 플랫폼을 모르는 판단 함수가
 * ① 정확 일치 정규식(라우팅은 `discord/__tests__/router.test.ts`) ② 원문 → 인자 표 ③ 브리핑 응답 대상을 그대로 `sendBriefing` 에 넘긴다
 * ④ 리포트 PDF 를 파일 단계(`replyFile`)로 보낸다 — 를 본다.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: { customStrategy: {}, alertConfig: {} } }))
vi.mock('@/bot/notifications/briefing', () => ({ sendBriefing: vi.fn(async () => undefined) }))
vi.mock('@/lib/news/prompt-news', () => ({ gatherTickerNews: vi.fn(async () => '수집 블록') }))
vi.mock('@/lib/ai/claude-advisor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ai/claude-advisor')>()),
  askAdvisor: vi.fn(),
}))
vi.mock('@/lib/report/pdf-generator', () => ({ generateReportPDF: vi.fn() }))
vi.mock('fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('fs')>()
  return { ...real, promises: { ...real.promises, readFile: vi.fn() } }
})
vi.mock('@/lib/backtest/engine', () => ({ runBacktest: vi.fn() }))
vi.mock('@/lib/custom-strategy/parser', () => ({ parseStrategyText: vi.fn() }))

import { promises as fs } from 'fs'
import { sendBriefing, type BriefingTarget } from '@/bot/notifications/briefing'
import { generateReportPDF } from '@/lib/report/pdf-generator'
import type { BotReply, ReplyFile, ReplyOutput } from '../../core/reply'
import { briefingArgsFromText, decideBriefing } from '../briefing'
import { decideReport, reportArgsFromText } from '../report'
import { backtestArgsFromText } from '../backtest'
import { CUSTOM_STRATEGY_LIST_RE, customStrategyDeleteArgsFromText, customStrategyRegisterArgsFromText } from '../custom-strategy'
import { ALERT_CONFIG_RE, alertArgsFromTelegram } from '../alert'
import { flush } from './test-utils'

function fakeOut() {
  const sent: (BotReply | { long: string } | { file: ReplyFile })[] = []
  const out: ReplyOutput = {
    reply: async (m) => { sent.push(m); return 'k' },
    replyLong: async (html) => { sent.push({ long: html }) },
    replyFile: async (file) => { sent.push({ file }) },
    typing: async () => undefined,
    typingIntervalMs: 60_000,
  }
  return { out, sent }
}

beforeEach(() => {
  vi.mocked(sendBriefing).mockClear()
  vi.mocked(generateReportPDF).mockReset()
  vi.mocked(fs.readFile).mockReset()
})

describe('정규식 상수 (P)', () => {
  it('정확 일치 명령은 "이름 + 다른 말" 을 잡지 않는다', () => {
    expect(CUSTOM_STRATEGY_LIST_RE.test('커스텀전략목록 보여줘')).toBe(false)
  })
})

describe('원문 → 인자 (A2)', () => {
  it.each([
    [briefingArgsFromText, '/briefing@MyBot  한국 ', '한국'],
    [briefingArgsFromText, '브리핑', ''],
    [reportArgsFromText, '/REPORT 2025 3', '2025 3'],
    [backtestArgsFromText, '백테스트  NVDA rsi 365', 'NVDA rsi 365'],
    [customStrategyRegisterArgsFromText, '/customstrategy SOXL 40', 'SOXL 40'],
    [customStrategyDeleteArgsFromText, '커스텀전략삭제 abc123', 'abc123'],
  ])('%#', (fn, text, args) => expect(fn(text)).toBe(args))

  it('알림설정 — command 는 ctx.match 문자열 · 비면 원문에서 벗긴다', () => {
    expect(alertArgsFromTelegram('급락 -3 ', '/alertconfig 급락 -3')).toBe('급락 -3')
    expect(alertArgsFromTelegram('', '/alertconfig')).toBe('')
    expect(alertArgsFromTelegram(undefined, '알림설정 급락 -3')).toBe('급락 -3')
  })

  it('알림설정 hears 의 매치 배열은 쓰지 않고 원문에서 벗긴다(PR-2c · UQ-3)', () => {
    expect(alertArgsFromTelegram('알림설정 급락 -3'.match(ALERT_CONFIG_RE), '알림설정 급락 -3')).toBe('급락 -3')
    expect(alertArgsFromTelegram('알림설정'.match(ALERT_CONFIG_RE), '알림설정')).toBe('')
  })
})

describe('브리핑 — 응답 대상 (D2)', () => {
  it('대상 없음 → 안내 · 발송 0', async () => {
    const f = fakeOut()
    await decideBriefing('한국', undefined, f.out)
    expect(f.sent).toEqual([{ text: '⚠️ 채팅 정보를 확인할 수 없습니다.', format: 'plain' }])
    expect(sendBriefing).not.toHaveBeenCalled()
  })

  it('받은 대상을 그대로 sendBriefing 에 넘긴다(라우트 스위치 무관)', async () => {
    const target: BriefingTarget = vi.fn()
    await decideBriefing('미국', target, fakeOut().out)
    expect(sendBriefing).toHaveBeenCalledWith('US', target)
  })
})

describe('리포트 — 파일 단계 (D)', () => {
  it('PDF 를 replyFile 로 · 이름 · 형식 · 캡션', async () => {
    vi.mocked(generateReportPDF).mockResolvedValueOnce({ pdfPath: '/tmp/x/q2.pdf' } as never)
    const data = Buffer.from('%PDF')
    vi.mocked(fs.readFile).mockResolvedValueOnce(data as never)
    const f = fakeOut()
    await decideReport('2026 2', f.out)
    await flush()
    expect(f.sent).toEqual([
      { long: '📊 <b>2026년 2분기 리포트</b> 생성 중... (2~3분 소요)' },
      { file: { name: 'q2.pdf', data, contentType: 'application/pdf', caption: '📊 2026년 2분기 리포트' } },
    ])
  })

  it('파일 전송 실패 → 정적 안내(plain)', async () => {
    vi.mocked(generateReportPDF).mockResolvedValueOnce({ pdfPath: 'q.pdf' } as never)
    vi.mocked(fs.readFile).mockResolvedValueOnce(Buffer.from('x') as never)
    const f = fakeOut()
    f.out.replyFile = async () => { throw new Error('too large') }
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await decideReport('2026 2', f.out)
    await flush()
    expect(f.sent[f.sent.length - 1]).toEqual({ text: '⚠️ 리포트 생성에 실패했습니다.', format: 'plain' })
  })
})
