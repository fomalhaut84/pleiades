/**
 * pleiades 009 D-3 PR-2b (pleiades#394) — 특수 경로 판단 함수 계약(설계 §4 P · A2 · D · D2).
 *
 * 텔레그램 호출열은 `special-telegram.test.ts` 가 고정한다. 여기서는 플랫폼을 모르는 판단 함수가
 * ① 등록 정규식 = export 상수(같은 객체) ② 텔레그램 원문 → 인자 표 ③ 브리핑 응답 대상을 그대로 `sendBriefing` 에 넘긴다
 * ④ 리포트 PDF 를 파일 단계(`replyFile`)로 보낸다 — 를 본다.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: { customStrategy: {}, alertConfig: {} } }))
vi.mock('@/bot/notifications/briefing', () => ({ sendBriefing: vi.fn(async () => undefined) }))
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
vi.mock('@/bot/notifications/notifier', () => ({ notifierForChat: vi.fn(() => ({ tag: 'chat-notifier' })) }))

import { promises as fs } from 'fs'
import { InputFile } from 'grammy'
import { notifierForChat } from '@/bot/notifications/notifier'
import { telegramOutput } from '../../utils/telegram-reply'
import { sendBriefing, type BriefingTarget } from '@/bot/notifications/briefing'
import { generateReportPDF } from '@/lib/report/pdf-generator'
import type { BotReply, ReplyFile, ReplyOutput } from '../../core/reply'
import { BRIEFING_RE, briefingArgsFromText, decideBriefing, registerBriefingCommands } from '../briefing'
import { REPORT_RE, decideReport, registerReportCommands, reportArgsFromText } from '../report'
import { BACKTEST_RE, backtestArgsFromText, registerBacktestCommands } from '../backtest'
import {
  CUSTOM_STRATEGY_DELETE_RE, CUSTOM_STRATEGY_LIST_RE, CUSTOM_STRATEGY_REGISTER_RE,
  customStrategyDeleteArgsFromText, customStrategyRegisterArgsFromText, registerCustomStrategyCommands,
} from '../custom-strategy'
import { ALERT_CONFIG_RE, alertArgsFromTelegram, registerAlertCommands } from '../alert'
import { captureBot, fakeCtx, flush } from './telegram-fake'

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

describe('정규식 상수 = 등록 객체 (P)', () => {
  it.each([
    ['briefing', registerBriefingCommands, [BRIEFING_RE]],
    ['report', registerReportCommands, [REPORT_RE]],
    ['backtest', registerBacktestCommands, [BACKTEST_RE]],
    ['custom-strategy', registerCustomStrategyCommands, [CUSTOM_STRATEGY_REGISTER_RE, CUSTOM_STRATEGY_LIST_RE, CUSTOM_STRATEGY_DELETE_RE]],
    ['alert', registerAlertCommands, [ALERT_CONFIG_RE]],
  ] as const)('%s', (_name, register, constants) => {
    const bot = captureBot(register as never)
    expect(bot.hears).toHaveLength(constants.length)
    bot.hears.forEach((h, i) => expect(h.re).toBe(constants[i]))
  })

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

describe('브리핑 — 텔레그램 어댑터의 대상 (9-1 리뷰 info 1)', () => {
  const handler = () => captureBot(registerBriefingCommands).hears[0].handler

  it('요청 chat 의 notifierForChat — 대상 함수가 받은 봇과 그 chatId 로', async () => {
    const f = fakeCtx({ text: '브리핑 한국', chatId: 321 })
    await handler()(f.ctx, vi.fn())
    const target = vi.mocked(sendBriefing).mock.calls[0][1] as BriefingTarget
    const bot = { api: undefined }
    expect(target(bot)).toEqual({ tag: 'chat-notifier' })
    expect(notifierForChat).toHaveBeenCalledWith(bot, 321)
  })

  it('chat 없음 → 대상 없음 → 안내', async () => {
    const f = fakeCtx({ text: '브리핑 한국' })
    ;(f.ctx as { chat?: unknown }).chat = undefined
    await handler()(f.ctx, vi.fn())
    expect(f.calls).toEqual([['reply', '⚠️ 채팅 정보를 확인할 수 없습니다.']])
    expect(sendBriefing).not.toHaveBeenCalled()
  })
})

describe('replyFile 텔레그램 어댑터 (9-1 리뷰 info 3)', () => {
  it('캡션 있음 → 인자 둘 · 없음 → 인자 하나', async () => {
    const f = fakeCtx({ text: 'x' })
    const out = telegramOutput(f.ctx as never)
    const data = Buffer.from('%PDF')
    await out.replyFile({ name: 'a.pdf', data, contentType: 'application/pdf', caption: '캡션' })
    await out.replyFile({ name: 'b.pdf', data, contentType: 'application/pdf' })
    expect(f.calls.map((c) => c.length)).toEqual([3, 2])
    const [, first, opts] = f.calls[0] as [string, InputFile, unknown]
    expect(first).toBeInstanceOf(InputFile)
    expect(first.filename).toBe('a.pdf')
    expect(opts).toStrictEqual({ caption: '캡션' })
    expect((f.calls[1][1] as InputFile).filename).toBe('b.pdf')
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
