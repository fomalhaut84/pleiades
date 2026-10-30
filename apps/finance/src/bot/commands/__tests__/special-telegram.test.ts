/**
 * pleiades 009 D-3 PR-2b (pleiades#394) — 특수 경로 텔레그램 특성 테스트: 브리핑 · 리포트 · 백테스트 · 커스텀전략 · 알림설정.
 *
 * 판단 분리 **전** 코드에서 스냅샷을 만들고 분리 뒤 같은지 본다(grammY 호출열 동등 · `lookup-telegram.test.ts` 와 같은 방식).
 * fire-and-forget(종목 심층 분석 · 리포트 PDF · 백테스트)은 끝까지 흘린 뒤 본다. typing 은 calls 밖에서 센다.
 * "현재 동작" 이라 적은 테스트는 서비스 유래 결함을 그대로 고정한다(UQ-3 — 수정은 PR-2c).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    customStrategy: { count: vi.fn(), create: vi.fn(), findMany: vi.fn(), delete: vi.fn() },
    alertConfig: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/bot/notifications/briefing', () => ({ sendBriefing: vi.fn() }))
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
import { InputFile } from 'grammy'
import { prisma } from '@/lib/prisma'
import { sendBriefing } from '@/bot/notifications/briefing'
import { askAdvisor, AdvisorError, describeAdvisorError } from '@/lib/ai/claude-advisor'
import { generateReportPDF } from '@/lib/report/pdf-generator'
import { runBacktest } from '@/lib/backtest/engine'
import { parseStrategyText } from '@/lib/custom-strategy/parser'
import { buildTickerAnalysisPrompt, registerBriefingCommands } from '../briefing'
import { registerReportCommands } from '../report'
import { registerBacktestCommands } from '../backtest'
import { registerCustomStrategyCommands } from '../custom-strategy'
import { registerAlertCommands } from '../alert'
import { splitMessage } from '../../utils/formatter'
import { markdownToTelegramHtml } from '../../utils/markdown'
import { captureBot, fakeCtx, flush, type FakeCtxOptions } from './telegram-fake'

const p = vi.mocked(prisma, { deep: true })
const m = {
  briefing: vi.mocked(sendBriefing),
  ask: vi.mocked(askAdvisor),
  pdf: vi.mocked(generateReportPDF),
  readFile: vi.mocked(fs.readFile),
  backtest: vi.mocked(runBacktest),
  parse: vi.mocked(parseStrategyText),
}

const briefing = captureBot(registerBriefingCommands)
const report = captureBot(registerReportCommands)
const backtest = captureBot(registerBacktestCommands)
const custom = captureBot(registerCustomStrategyCommands)
const alert = captureBot(registerAlertCommands)

type Handler = (ctx: unknown, next: () => Promise<void>) => Promise<void>
type Bot = ReturnType<typeof captureBot>
const cmd = (bot: Bot, name: string) => bot.commands.find((c) => c.name === name)!.handler
const hears = (bot: Bot, i: number) => bot.hears[i].handler

async function run(handler: Handler, text: string, opts: FakeCtxOptions = {}) {
  const f = fakeCtx({ text, ...opts })
  await handler(f.ctx, vi.fn())
  await flush()
  return f
}

/** hears 경로 — grammY 처럼 `ctx.match` 에 정규식 매치 배열을 둔다. */
async function runHears(bot: Bot, i: number, text: string, opts: FakeCtxOptions = {}) {
  return run(hears(bot, i), text, { match: text.match(bot.hears[i].re) ?? undefined, ...opts })
}

/** command 경로 — grammY 처럼 `ctx.match` 에 명령 뒤 문자열(앞 공백 제거)을 둔다. */
async function runCmd(bot: Bot, name: string, text: string, opts: FakeCtxOptions = {}) {
  const match = text.replace(/^\/\S+\s*/, '')
  return run(cmd(bot, name), text, { match, ...opts })
}

function resetAll(obj: unknown): void {
  for (const v of Object.values(obj as Record<string, unknown>)) {
    if (typeof v === 'function' && 'mockReset' in v) (v as { mockReset: () => void }).mockReset()
    else if (v && typeof v === 'object') resetAll(v)
  }
}

beforeEach(() => {
  resetAll(p)
  for (const v of Object.values(m)) v.mockReset()
  m.briefing.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => vi.useRealTimers())

describe('등록', () => {
  it('명령·정규식 · 순서', () => {
    expect(briefing.commands.map((c) => c.name)).toEqual(['briefing'])
    expect(briefing.hears.map((x) => x.re.source)).toEqual(['^브리핑(?:\\s+.*)?$'])
    expect(report.commands.map((c) => c.name)).toEqual(['report'])
    expect(report.hears.map((x) => x.re.source)).toEqual(['^리포트(?:\\s+.*)?$'])
    expect(backtest.commands.map((c) => c.name)).toEqual(['backtest'])
    expect(backtest.hears.map((x) => x.re.source)).toEqual(['^백테스트(?:\\s+.*)?$'])
    expect(custom.commands.map((c) => c.name)).toEqual(['customstrategy', 'customstrategylist', 'customstrategydelete'])
    expect(custom.hears.map((x) => x.re.source)).toEqual(['^커스텀전략등록(?:\\s+.*)?$', '^커스텀전략목록\\s*$', '^커스텀전략삭제(?:\\s+.*)?$'])
    expect(alert.commands.map((c) => c.name)).toEqual(['alertconfig'])
    expect(alert.hears.map((x) => x.re.source)).toEqual(['^알림설정(?:\\s+.*)?$'])
  })
})

describe('브리핑', () => {
  it('chat 없음 → 안내 · 발송 0', async () => {
    const f = fakeCtx({ text: '브리핑' })
    ;(f.ctx as { chat?: unknown }).chat = undefined
    await hears(briefing, 0)(f.ctx, vi.fn())
    expect(f.calls).toEqual([['reply', '⚠️ 채팅 정보를 확인할 수 없습니다.']])
    expect(m.briefing).not.toHaveBeenCalled()
  })

  it.each([
    ['브리핑 한국', 'KR'], ['브리핑 kr', 'KR'], ['브리핑 KR', 'KR'],
    ['브리핑 미국', 'US'], ['/briefing@MyBot us', 'US'], ['/BRIEFING US', 'US'],
  ])('세션 키워드 %s → %s · 요청 chat 으로', async (text, session) => {
    const handler = text.startsWith('/') ? cmd(briefing, 'briefing') : hears(briefing, 0)
    const f = await run(handler, text, { chatId: 321 })
    expect(f.calls).toEqual([['reply', '📊 브리핑 생성 중... (통상 1~2분, 최대 10분 이상 걸릴 수 있어요)']])
    expect(m.briefing).toHaveBeenCalledTimes(1)
    expect(m.briefing.mock.calls[0][0]).toBe(session)
  })

  it.each([
    ['2026-10-29T21:00:00Z', 'KR'], // KST 06:00
    ['2026-10-30T05:59:00Z', 'KR'], // KST 14:59
    ['2026-10-30T06:00:00Z', 'US'], // KST 15:00
    ['2026-10-29T20:59:00Z', 'US'], // KST 05:59
  ])('인자 없음 → 시각 기본값 %s = %s', async (now, session) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(now))
    await run(hears(briefing, 0), '브리핑')
    expect(m.briefing.mock.calls[0][0]).toBe(session)
  })

  it('발송 실패는 로그만(응답 없음)', async () => {
    m.briefing.mockRejectedValueOnce(new Error('send'))
    const f = await run(hears(briefing, 0), '브리핑 한국')
    expect(f.calls).toHaveLength(1)
    expect(console.error).toHaveBeenCalledWith('[bot] 브리핑 발송 실패:', expect.any(Error))
  })

  describe('종목 심층 분석', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
      vi.setSystemTime(new Date('2026-10-30T01:00:00Z'))
    })

    it('안내 → advisor(프롬프트 · 옵션) → html 4096 이하면 html 한 번', async () => {
      m.ask.mockResolvedValueOnce({ response: '**NVDA** 요약 & <x>' } as never)
      const f = await run(hears(briefing, 0), '브리핑 nvda')
      expect(m.ask).toHaveBeenCalledWith(buildTickerAnalysisPrompt('NVDA'), {
        model: 'sonnet', timeout: 300_000, maxBudgetUsd: 1.0, caller: 'bot:brief_command', expectsTools: true,
        retryOnNoToolUsed: 5, overallTimeoutMs: 900_000,
      })
      expect(f.calls).toEqual([
        ['reply', '🔍 NVDA 심층 분석 중... (통상 1~2분, 최대 10분 이상 걸릴 수 있어요)'],
        ['reply', markdownToTelegramHtml('**NVDA** 요약 & <x>'), { parse_mode: 'HTML' }],
      ])
      expect(m.briefing).not.toHaveBeenCalled()
    })

    it('html 전송 실패 → 원문 plain 한 번', async () => {
      m.ask.mockResolvedValueOnce({ response: '**A**' } as never)
      const f = fakeCtx({ text: '브리핑 A' })
      const original = f.ctx.reply.getMockImplementation()!
      f.ctx.reply.mockImplementation(async (...args: unknown[]) => {
        const sent = await original(...args)
        if ((args[1] as { parse_mode?: string } | undefined)?.parse_mode) throw new Error('parse')
        return sent
      })
      await hears(briefing, 0)(f.ctx, vi.fn())
      await flush()
      expect(f.calls.map((c) => c.slice(1))).toEqual([
        ['🔍 A 심층 분석 중... (통상 1~2분, 최대 10분 이상 걸릴 수 있어요)'],
        [markdownToTelegramHtml('**A**'), { parse_mode: 'HTML' }],
        ['**A**'],
      ])
    })

    it('html 이 4096 넘으면 원문을 4096 단위 plain 으로 나눠 보낸다', async () => {
      const long = `${'가'.repeat(3000)}\n${'나'.repeat(3000)}`
      m.ask.mockResolvedValueOnce({ response: long } as never)
      const f = await run(hears(briefing, 0), '브리핑 B')
      expect(f.calls.slice(1)).toEqual(splitMessage(long).map((c) => ['reply', c]))
    })

    it('AdvisorError → code 별 안내 · 그 외 → 정적 안내 · typing 5 s · 끝나면 멈춘다', async () => {
      const err = new AdvisorError('x', 'tail', 'auth_expired')
      m.ask.mockRejectedValueOnce(err)
      const a = await run(hears(briefing, 0), '브리핑 X')
      m.ask.mockRejectedValueOnce(new Error('boom'))
      const b = await run(hears(briefing, 0), '브리핑 Y')
      expect(a.calls[1]).toEqual(['reply', describeAdvisorError(err)])
      expect(console.error).toHaveBeenCalledWith('[bot] briefing advisor detail (auth_expired): tail')
      expect(b.calls[1]).toEqual(['reply', '⚠️ Y 분석에 실패했습니다. 잠시 후 다시 시도해주세요.'])

      let resolve!: (v: unknown) => void
      m.ask.mockImplementationOnce(() => new Promise((r) => { resolve = r }) as never)
      const t = await run(hears(briefing, 0), '브리핑 Z')
      vi.advanceTimersByTime(4999)
      expect(t.ctx.replyWithChatAction).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(t.ctx.replyWithChatAction).toHaveBeenCalledWith('typing')
      resolve({ response: 'ok' })
      await flush()
      vi.advanceTimersByTime(20000)
      expect(t.ctx.replyWithChatAction).toHaveBeenCalledTimes(1)
    })
  })
})

describe('리포트', () => {
  it('인자 없음 → 직전 분기(KST) · 생성 중(html) → PDF 문서 + 캡션', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-03-31T16:00:00Z')) // KST 04-01 → 1분기
    m.pdf.mockResolvedValueOnce({ pdfPath: '/elsewhere/q1.pdf' } as never)
    m.readFile.mockResolvedValueOnce(Buffer.from('PDF') as never)
    const f = await runHears(report, 0, '리포트')
    expect(m.pdf).toHaveBeenCalledWith(2026, 1)
    expect(m.readFile.mock.calls[0][0]).toMatch(/[/\\]reports[/\\]q1\.pdf$/)
    expect(f.calls[0]).toEqual(['reply', '📊 <b>2026년 1분기 리포트</b> 생성 중... (2~3분 소요)', { parse_mode: 'HTML' }])
    const [name, file, opts] = f.calls[1] as [string, InputFile, unknown]
    expect(name).toBe('replyWithDocument')
    expect(file).toBeInstanceOf(InputFile)
    expect(file.filename).toBe('q1.pdf')
    expect(opts).toStrictEqual({ caption: '📊 2026년 1분기 리포트' })
    expect(f.calls).toHaveLength(2)
  })

  it.each([
    ['2026-01-15T00:00:00Z', 2025, 4], ['2026-05-01T00:00:00Z', 2026, 1],
    ['2026-08-01T00:00:00Z', 2026, 2], ['2026-12-01T00:00:00Z', 2026, 3],
  ])('직전 분기 %s → %i년 %i분기', async (now, year, q) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(now))
    m.pdf.mockReturnValueOnce(new Promise(() => undefined) as never)
    await runHears(report, 0, '리포트')
    expect(m.pdf).toHaveBeenCalledWith(year, q)
  })

  it('연도·분기 인자 · /report@bot · 잘못된 값', async () => {
    m.pdf.mockReturnValue(new Promise(() => undefined) as never)
    await runCmd(report, 'report', '/report@MyBot 2025 3')
    expect(m.pdf).toHaveBeenLastCalledWith(2025, 3)
    const outs = [
      (await runHears(report, 0, '리포트 2019 1')).calls,
      (await runHears(report, 0, '리포트 2025 5')).calls,
      (await runHears(report, 0, '리포트 2025')).calls,
    ]
    expect(outs).toEqual([
      [['reply', '⚠️ 유효한 연도를 입력해주세요. (2020~2100)']],
      [['reply', '⚠️ 유효한 분기를 입력해주세요. (1~4)']],
      [['reply', '⚠️ 유효한 분기를 입력해주세요. (1~4)']],
    ])
  })

  it('생성 실패 · 파일 읽기 실패 → 정적 안내', async () => {
    m.pdf.mockRejectedValueOnce(new Error('render'))
    const a = await runHears(report, 0, '리포트 2025 1')
    m.pdf.mockResolvedValueOnce({ pdfPath: 'x.pdf' } as never)
    m.readFile.mockRejectedValueOnce(new Error('ENOENT'))
    const b = await runHears(report, 0, '리포트 2025 1')
    expect(a.calls[1]).toEqual(['reply', '⚠️ 리포트 생성에 실패했습니다.'])
    expect(b.calls[1]).toEqual(['reply', '⚠️ 리포트 생성에 실패했습니다.'])
  })
})

describe('백테스트', () => {
  const RESULT = {
    strategyName: 'RSI <30/70>', period: '2025-10-30 ~ 2026-10-30',
    metrics: { totalReturn: 12.3, annualizedReturn: 12.3, maxDrawdown: 8.1, sharpeRatio: 1.234, totalTrades: 6, winRate: 66.6, profitFactor: Infinity, avgHoldDays: 12 },
    benchmarkReturn: 10,
    trades: Array.from({ length: 7 }, (_, i) => ({ type: i % 2 ? 'SELL' : 'BUY', date: `2026-0${i + 1}-01`, price: 100 + i, shares: 10, pnl: i % 2 ? (i === 3 ? -1234.5 : 5678.9) : null })),
  }

  it('사용법(html) · /backtest@bot', async () => {
    const a = await runCmd(backtest, 'backtest', '/backtest@MyBot')
    const b = await runHears(backtest, 0, '백테스트')
    expect(a.calls).toEqual(b.calls)
    expect(a.calls).toMatchSnapshot()
  })

  it('모르는 전략 · 기간 범위 밖', async () => {
    const outs = [
      (await runHears(backtest, 0, '백테스트 NVDA 마법')).calls,
      (await runHears(backtest, 0, '백테스트 NVDA rsi 29')).calls,
      (await runHears(backtest, 0, '백테스트 NVDA rsi 3651')).calls,
      (await runHears(backtest, 0, '백테스트 NVDA rsi abc')).calls,
    ]
    expect(outs).toMatchSnapshot()
    expect(m.backtest).not.toHaveBeenCalled()
  })

  it('실행 — 안내(html) → 결과(html) · 엔진 입력 · 별칭 · 기본 rsi 365 · typing 5 s', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(new Date('2026-10-30T00:00:00Z'))
    let resolve!: (v: unknown) => void
    m.backtest.mockImplementationOnce(() => new Promise((r) => { resolve = r }) as never)
    const f = await runHears(backtest, 0, '백테스트 nvda')
    const input = m.backtest.mock.calls[0][0] as { ticker: string; strategy: { name: string }; startDate: Date; endDate: Date }
    expect(input.ticker).toBe('NVDA')
    expect(input.endDate.toISOString()).toBe('2026-10-30T00:00:00.000Z')
    expect(input.startDate.toISOString()).toBe('2025-10-30T00:00:00.000Z')
    expect(m.backtest.mock.calls[0][0]).toMatchObject({ initialCapital: 10_000_000, positionSize: 0.9, commission: 0.0025 })
    vi.advanceTimersByTime(5000)
    expect(f.ctx.replyWithChatAction).toHaveBeenCalledTimes(1)
    resolve(RESULT)
    await flush()
    vi.advanceTimersByTime(20000)
    expect(f.ctx.replyWithChatAction).toHaveBeenCalledTimes(1)
    expect(f.calls).toMatchSnapshot()

    m.backtest.mockResolvedValueOnce({ ...RESULT, trades: [], metrics: { ...RESULT.metrics, profitFactor: 1.5 } } as never)
    const alias = await runHears(backtest, 0, '백테스트 AAPL 골든크로스 90')
    expect((m.backtest.mock.calls[1][0] as { strategy: unknown }).strategy).toBeDefined()
    expect(alias.calls).toMatchSnapshot()
  })

  it('현재 동작 — 실패 시 오류 원문을 그대로 보인다(서비스 유래)', async () => {
    m.backtest.mockRejectedValueOnce(new Error('데이터 부족 <30일>'))
    const f = await runHears(backtest, 0, '백테스트 NEW')
    expect(f.calls[1]).toEqual(['reply', '⚠️ 백테스트 실패: 데이터 부족 <30일>'])
  })
})

describe('커스텀전략', () => {
  const PARSED = { name: '  SOXL 저점 ', ticker: 'SOXL', conditions: [{ type: 'price', op: 'lte', value: 40 }], logic: 'AND', frequency: 'once_daily' }

  it('등록 — 사용법 · 한도 · 파싱 중 → 등록 완료(html) · DB 입력', async () => {
    const usage = await runHears(custom, 0, '커스텀전략등록')
    p.customStrategy.count.mockResolvedValueOnce(50 as never)
    const full = await runHears(custom, 0, '커스텀전략등록 SOXL 40 이하')
    p.customStrategy.count.mockResolvedValueOnce(1 as never)
    m.parse.mockResolvedValueOnce(PARSED as never)
    p.customStrategy.create.mockResolvedValueOnce({ id: 'c'.repeat(19) + 'abc123', name: 'SOXL 저점', ticker: 'SOXL', frequency: 'once_daily' } as never)
    const ok = await runCmd(custom, 'customstrategy', '/customstrategy  SOXL 40달러 <이하> ')
    expect(m.parse).toHaveBeenCalledWith('SOXL 40달러 <이하>')
    expect(p.customStrategy.create.mock.calls[0][0]).toStrictEqual({
      data: { name: 'SOXL 저점', description: 'SOXL 40달러 <이하>', ticker: 'SOXL', conditions: PARSED.conditions, logic: 'AND', frequency: 'once_daily' },
    })
    expect([usage.calls, full.calls, ok.calls]).toMatchSnapshot()
  })

  it('현재 동작 — 파싱 실패 시 오류 원문을 그대로 보인다(UQ-3)', async () => {
    p.customStrategy.count.mockResolvedValueOnce(0 as never)
    m.parse.mockRejectedValueOnce(new Error('조건을 해석할 수 없음: "<x>"'))
    const f = await runHears(custom, 0, '커스텀전략등록 아무거나')
    expect(f.calls).toEqual([
      ['reply', '🤖 전략 파싱 중... (최대 60초)'],
      ['reply', '⚠️ 전략 파싱 실패\n\n조건을 해석할 수 없음: "<x>"\n\n표현을 바꿔서 다시 시도해주세요.'],
    ])
    expect(p.customStrategy.create).not.toHaveBeenCalled()
  })

  it('등록 — 처리 중 던지면 그대로 던진다(등록에 catch 없음)', async () => {
    p.customStrategy.count.mockRejectedValueOnce(new Error('db'))
    const f = fakeCtx({ text: '커스텀전략등록 X' })
    await expect(hears(custom, 0)(f.ctx, vi.fn())).rejects.toThrow('db')
  })

  it('목록 — 없음 · 블록(html · 상태 · 최근 발동 · 조건 파싱 오류)', async () => {
    p.customStrategy.findMany.mockResolvedValueOnce([] as never)
    const empty = await runHears(custom, 1, '커스텀전략목록')
    p.customStrategy.findMany.mockResolvedValueOnce([
      { id: 'x'.repeat(19) + 'aaa111', name: 'A<1>', ticker: 'SOXL', conditions: [{ type: 'price', op: 'lte', value: 40 }], logic: 'AND', frequency: 'once_daily', isActive: true, lastTriggeredAt: new Date('2026-10-01T00:00:00Z') },
      { id: 'y'.repeat(19) + 'bbb222', name: 'B', ticker: 'NVDA', conditions: 'broken', logic: 'OR', frequency: 'every', isActive: false, lastTriggeredAt: null },
    ] as never)
    const list = await runCmd(custom, 'customstrategylist', '/customstrategylist')
    expect(p.customStrategy.findMany.mock.calls[0][0]).toStrictEqual({ orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }] })
    expect([empty.calls, list.calls]).toMatchSnapshot()
  })

  it('삭제 — 사용법 · 없음 · 여럿 · 삭제(plain) · endsWith 검색', async () => {
    const usage = await runHears(custom, 2, '커스텀전략삭제')
    p.customStrategy.findMany.mockResolvedValueOnce([] as never)
    const none = await runHears(custom, 2, '커스텀전략삭제 zz9')
    p.customStrategy.findMany.mockResolvedValueOnce([{ id: '1abc123', name: 'A', ticker: 'X' }, { id: '2abc123', name: 'B', ticker: 'Y' }] as never)
    const many = await runHears(custom, 2, '커스텀전략삭제 abc123')
    p.customStrategy.findMany.mockResolvedValueOnce([{ id: 'idabc123', name: 'A<b>', ticker: 'X' }] as never)
    const ok = await runCmd(custom, 'customstrategydelete', '/customstrategydelete abc123')
    expect(p.customStrategy.findMany.mock.calls[0][0]).toStrictEqual({ where: { id: { endsWith: 'zz9' } }, take: 5 })
    expect(p.customStrategy.delete.mock.calls[0][0]).toStrictEqual({ where: { id: 'idabc123' } })
    expect([usage.calls, none.calls, many.calls, ok.calls]).toMatchSnapshot()
  })
})

describe('알림설정', () => {
  const CONFIGS = [
    { key: 'price_drop_pct', label: '급락 <기준>', value: '-5' },
    { key: 'unknown_key', label: '기타', value: 'x&y' },
  ]

  it('/alertconfig 인자 없음 → 현황(html) · 없음', async () => {
    p.alertConfig.findMany.mockResolvedValueOnce(CONFIGS as never)
    const list = await runCmd(alert, 'alertconfig', '/alertconfig')
    p.alertConfig.findMany.mockResolvedValueOnce([] as never)
    const none = await runCmd(alert, 'alertconfig', '/alertconfig')
    expect(p.alertConfig.findMany.mock.calls[0][0]).toStrictEqual({ orderBy: { key: 'asc' } })
    expect([list.calls, none.calls]).toMatchSnapshot()
  })

  it('/alertconfig 인자 부족 · 모르는 항목 · 값 형식(숫자 · 토글) · 없는 설정', async () => {
    const outs = [
      (await runCmd(alert, 'alertconfig', '/alertconfig 급락')).calls,
      (await runCmd(alert, 'alertconfig', '/alertconfig 폭락 -3')).calls,
      (await runCmd(alert, 'alertconfig', '/alertconfig 급락 많이')).calls,
      (await runCmd(alert, 'alertconfig', '/alertconfig 능동리뷰 yes')).calls,
    ]
    p.alertConfig.findUnique.mockResolvedValueOnce(null as never)
    outs.push((await runCmd(alert, 'alertconfig', '/alertconfig 급락 -3')).calls)
    expect(outs).toMatchSnapshot()
  })

  it('/alertconfig 변경 — 숫자 · 토글 소문자 정규화 · html', async () => {
    p.alertConfig.findUnique.mockResolvedValueOnce({ value: '-5' } as never)
    p.alertConfig.update.mockResolvedValueOnce({ label: '급락 <기준>', value: '-3' } as never)
    const num = await runCmd(alert, 'alertconfig', '/alertconfig 급락 -3')
    p.alertConfig.findUnique.mockResolvedValueOnce({ value: 'off' } as never)
    p.alertConfig.update.mockResolvedValueOnce({ label: '능동 리뷰', value: 'on' } as never)
    const toggle = await runCmd(alert, 'alertconfig', '/alertconfig 능동리뷰 ON')
    expect(p.alertConfig.update.mock.calls.map((c) => c[0])).toStrictEqual([
      { where: { key: 'price_drop_pct' }, data: { value: '-3' } },
      { where: { key: 'active_review' }, data: { value: 'on' } },
    ])
    expect([num.calls, toggle.calls]).toMatchSnapshot()
  })

  // PR-2c (#396 · UQ-3) 이전: 매치 배열 전체가 인자라 항목 = "알림설정" · 인자 없음이 인자 부족 안내였다(로컬 실측 2026-10-30)
  it('한글 "알림설정 급락 -3" → /alertconfig 와 같은 변경(PR-2c 수정)', async () => {
    p.alertConfig.findUnique.mockResolvedValueOnce({ value: '-5' } as never)
    p.alertConfig.update.mockResolvedValueOnce({ label: '급락 <기준>', value: '-3' } as never)
    const ko = await runHears(alert, 0, '알림설정 급락 -3')
    p.alertConfig.findUnique.mockResolvedValueOnce({ value: '-5' } as never)
    p.alertConfig.update.mockResolvedValueOnce({ label: '급락 <기준>', value: '-3' } as never)
    const en = await runCmd(alert, 'alertconfig', '/alertconfig 급락 -3')
    expect(ko.calls).toEqual(en.calls)
    expect(p.alertConfig.update.mock.calls[0][0]).toStrictEqual({ where: { key: 'price_drop_pct' }, data: { value: '-3' } })
  })

  it('한글 "알림설정" 만 → 현황(PR-2c 수정)', async () => {
    p.alertConfig.findMany.mockResolvedValueOnce(CONFIGS as never)
    const ko = await runHears(alert, 0, '알림설정')
    p.alertConfig.findMany.mockResolvedValueOnce(CONFIGS as never)
    const en = await runCmd(alert, 'alertconfig', '/alertconfig')
    expect(ko.calls).toEqual(en.calls)
    expect(String(ko.calls[0][1]).startsWith('⚙️ <b>알림 설정 현황</b>')).toBe(true)
  })

  it('처리 중 던지면 정적 안내', async () => {
    p.alertConfig.findMany.mockRejectedValueOnce(new Error('db'))
    const f = await runCmd(alert, 'alertconfig', '/alertconfig')
    expect(f.calls).toEqual([['reply', '⚠️ 알림 설정에 실패했습니다.']])
  })
})
