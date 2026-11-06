/**
 * pleiades 009 D-5 B3a (pleiades#509) — special-telegram.test.ts 를 판단 단위로 옮겼다(어댑터 없음).
 *
 * 브리핑(종목 심층 분석 포함) · 리포트(PDF) · 백테스트 · 커스텀전략 · 알림설정. describe·it 제목은 옛 파일과 같다.
 * 등록 핸들러가 계산하던 인자(`*ArgsFromText` · `alertArgsFromTelegram`)를 그대로 만들어 `decide*` 를 직접 부른다.
 * fire-and-forget(종목 심층 분석 · 리포트 PDF · 백테스트)은 끝까지 흘린 뒤 본다. typing 은 steps 밖에서 센다(`typing` mock).
 * 옛 `replyHtml`(`ctx.reply(html, {parse_mode})`) 은 여기서 `['long', html]` 단계다.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    customStrategy: { count: vi.fn(), create: vi.fn(), findMany: vi.fn(), delete: vi.fn() },
    alertConfig: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/bot/notifications/briefing', () => ({ sendBriefing: vi.fn() }))
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
import { prisma } from '@/lib/prisma'
import { sendBriefing, type BriefingTarget } from '@/bot/notifications/briefing'
import { askAdvisor, AdvisorError, describeAdvisorError } from '@/lib/ai/claude-advisor'
import { generateReportPDF } from '@/lib/report/pdf-generator'
import { runBacktest } from '@/lib/backtest/engine'
import { parseStrategyText } from '@/lib/custom-strategy/parser'
import type { BotReply, ReplyOutput } from '../../core/reply'
import { briefingArgsFromText, buildTickerAnalysisPrompt, decideBriefing } from '../briefing'
import { decideReport, reportArgsFromText } from '../report'
import { backtestArgsFromText, decideBacktest } from '../backtest'
import {
  customStrategyDeleteArgsFromText, customStrategyRegisterArgsFromText,
  decideCustomStrategyDelete, decideCustomStrategyList, decideCustomStrategyRegister,
} from '../custom-strategy'
import { ALERT_CONFIG_RE, alertArgsFromTelegram, decideAlertConfig } from '../alert'
import { splitMessage } from '../../utils/formatter'
import { markdownToTelegramHtml } from '../../utils/markdown'
import { flush, recordingOutput, type Step } from './test-utils'

const p = vi.mocked(prisma, { deep: true })
const m = {
  briefing: vi.mocked(sendBriefing),
  ask: vi.mocked(askAdvisor),
  pdf: vi.mocked(generateReportPDF),
  readFile: vi.mocked(fs.readFile),
  backtest: vi.mocked(runBacktest),
  parse: vi.mocked(parseStrategyText),
}

/** 요청 chat 의 응답 대상 자리 — 판단은 받은 대상을 sendBriefing 에 그대로 넘기기만 한다(텔레그램 notifierForChat 은 어댑터 몫). */
const TARGET: BriefingTarget = vi.fn() as unknown as BriefingTarget

async function run(decide: (out: ReplyOutput) => Promise<void>) {
  const r = recordingOutput()
  await decide(r.out)
  await flush()
  return r
}

// 등록 핸들러가 계산하던 인자 그대로
const briefingRun = (text: string) => run((out) => decideBriefing(briefingArgsFromText(text), TARGET, out))
const reportRun = (text: string) => run((out) => decideReport(reportArgsFromText(text), out))
const backtestRun = (text: string) => run((out) => decideBacktest(backtestArgsFromText(text), out))
const registerRun = (text: string) => run((out) => decideCustomStrategyRegister(customStrategyRegisterArgsFromText(text), out))
const deleteRun = (text: string) => run((out) => decideCustomStrategyDelete(customStrategyDeleteArgsFromText(text), out))
/** `/alertconfig` 명령 — 옛 runCmd 처럼 ctx.match = 명령 뒤 문자열(앞 공백 제거). */
const alertCmd = (text: string) => run((out) => decideAlertConfig(alertArgsFromTelegram(text.replace(/^\/\S+\s*/, ''), text), out))
/** 한글 `알림설정` — 옛 runHears 처럼 ctx.match = 정규식 매치 배열. */
const alertHears = (text: string) => run((out) => decideAlertConfig(alertArgsFromTelegram(text.match(ALERT_CONFIG_RE), text), out))

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

describe('브리핑', () => {
  it.each([
    ['브리핑 한국', 'KR'], ['브리핑 kr', 'KR'], ['브리핑 KR', 'KR'],
    ['브리핑 미국', 'US'], ['/briefing@MyBot us', 'US'], ['/BRIEFING US', 'US'],
  ])('세션 키워드 %s → %s · 요청 chat 으로', async (text, session) => {
    const f = await briefingRun(text)
    expect(f.steps).toEqual([['reply', '📊 브리핑 생성 중... (통상 1~2분, 최대 10분 이상 걸릴 수 있어요)', 'plain']])
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
    await briefingRun('브리핑')
    expect(m.briefing.mock.calls[0][0]).toBe(session)
  })

  it('발송 실패는 로그만(응답 없음)', async () => {
    m.briefing.mockRejectedValueOnce(new Error('send'))
    const f = await briefingRun('브리핑 한국')
    expect(f.steps).toHaveLength(1)
    expect(console.error).toHaveBeenCalledWith('[bot] 브리핑 발송 실패:', expect.any(Error))
  })

  describe('종목 심층 분석', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
      vi.setSystemTime(new Date('2026-10-30T01:00:00Z'))
    })

    it('안내 → advisor(프롬프트 · 옵션) → html 4096 이하면 html 한 번', async () => {
      m.ask.mockResolvedValueOnce({ response: '**NVDA** 요약 & <x>' } as never)
      const f = await briefingRun('브리핑 nvda')
      expect(m.ask).toHaveBeenCalledWith(buildTickerAnalysisPrompt('NVDA', new Date(), '수집 블록'), {
        model: 'sonnet', timeout: 300_000, maxBudgetUsd: 1.0, caller: 'bot:brief_command', expectsTools: true,
        retryOnNoToolUsed: 5, overallTimeoutMs: 900_000,
      })
      expect(f.steps).toEqual([
        ['reply', '🔍 NVDA 심층 분석 중... (통상 1~2분, 최대 10분 이상 걸릴 수 있어요)', 'plain'],
        ['reply', markdownToTelegramHtml('**NVDA** 요약 & <x>'), 'html'],
      ])
      expect(m.briefing).not.toHaveBeenCalled()
    })

    it('html 전송 실패 → 원문 plain 한 번', async () => {
      m.ask.mockResolvedValueOnce({ response: '**A**' } as never)
      const r = recordingOutput()
      const original = r.out.reply
      // 옛 테스트처럼 기록은 하고 html 이면 던진다
      r.out.reply = vi.fn(async (message: BotReply) => {
        const key = await original(message)
        if (message.format === 'html') throw new Error('parse')
        return key
      })
      await decideBriefing(briefingArgsFromText('브리핑 A'), TARGET, r.out)
      await flush()
      expect(r.steps).toEqual([
        ['reply', '🔍 A 심층 분석 중... (통상 1~2분, 최대 10분 이상 걸릴 수 있어요)', 'plain'],
        ['reply', markdownToTelegramHtml('**A**'), 'html'],
        ['reply', '**A**', 'plain'],
      ])
    })

    it('html 이 4096 넘으면 원문을 4096 단위 plain 으로 나눠 보낸다', async () => {
      const long = `${'가'.repeat(3000)}\n${'나'.repeat(3000)}`
      m.ask.mockResolvedValueOnce({ response: long } as never)
      const f = await briefingRun('브리핑 B')
      expect(f.steps.slice(1)).toEqual(splitMessage(long).map((c) => ['reply', c, 'plain']))
    })

    it('AdvisorError → code 별 안내 · 그 외 → 정적 안내 · typing 5 s · 끝나면 멈춘다', async () => {
      const err = new AdvisorError('x', 'tail', 'auth_expired')
      m.ask.mockRejectedValueOnce(err)
      const a = await briefingRun('브리핑 X')
      m.ask.mockRejectedValueOnce(new Error('boom'))
      const b = await briefingRun('브리핑 Y')
      expect(a.steps[1]).toEqual(['reply', describeAdvisorError(err), 'plain'])
      expect(console.error).toHaveBeenCalledWith('[bot] briefing advisor detail (auth_expired): tail')
      expect(b.steps[1]).toEqual(['reply', '⚠️ Y 분석에 실패했습니다. 잠시 후 다시 시도해주세요.', 'plain'])

      let resolve!: (v: unknown) => void
      m.ask.mockImplementationOnce(() => new Promise((r) => { resolve = r }) as never)
      const t = await briefingRun('브리핑 Z')
      vi.advanceTimersByTime(4999)
      expect(t.typing).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(t.typing).toHaveBeenCalledTimes(1)
      resolve({ response: 'ok' })
      await flush()
      vi.advanceTimersByTime(20000)
      expect(t.typing).toHaveBeenCalledTimes(1)
    })
  })
})

describe('리포트', () => {
  it('인자 없음 → 직전 분기(KST) · 생성 중(html) → PDF 문서 + 캡션', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-03-31T16:00:00Z')) // KST 04-01 → 1분기
    m.pdf.mockResolvedValueOnce({ pdfPath: '/elsewhere/q1.pdf' } as never)
    m.readFile.mockResolvedValueOnce(Buffer.from('PDF') as never)
    const f = await reportRun('리포트')
    expect(m.pdf).toHaveBeenCalledWith(2026, 1)
    expect(m.readFile.mock.calls[0][0]).toMatch(/[/\\]reports[/\\]q1\.pdf$/)
    expect(f.steps).toEqual([
      ['long', '📊 <b>2026년 1분기 리포트</b> 생성 중... (2~3분 소요)'],
      ['file', 'q1.pdf', 'application/pdf', '📊 2026년 1분기 리포트'],
    ])
  })

  it.each([
    ['2026-01-15T00:00:00Z', 2025, 4], ['2026-05-01T00:00:00Z', 2026, 1],
    ['2026-08-01T00:00:00Z', 2026, 2], ['2026-12-01T00:00:00Z', 2026, 3],
  ])('직전 분기 %s → %i년 %i분기', async (now, year, q) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(now))
    m.pdf.mockReturnValueOnce(new Promise(() => undefined) as never)
    await reportRun('리포트')
    expect(m.pdf).toHaveBeenCalledWith(year, q)
  })

  it('연도·분기 인자 · /report@bot · 잘못된 값', async () => {
    m.pdf.mockReturnValue(new Promise(() => undefined) as never)
    await reportRun('/report@MyBot 2025 3')
    expect(m.pdf).toHaveBeenLastCalledWith(2025, 3)
    const outs = [
      (await reportRun('리포트 2019 1')).steps,
      (await reportRun('리포트 2025 5')).steps,
      (await reportRun('리포트 2025')).steps,
    ]
    expect(outs).toEqual([
      [['reply', '⚠️ 유효한 연도를 입력해주세요. (2020~2100)', 'plain']],
      [['reply', '⚠️ 유효한 분기를 입력해주세요. (1~4)', 'plain']],
      [['reply', '⚠️ 유효한 분기를 입력해주세요. (1~4)', 'plain']],
    ])
  })

  it('생성 실패 · 파일 읽기 실패 → 정적 안내', async () => {
    m.pdf.mockRejectedValueOnce(new Error('render'))
    const a = await reportRun('리포트 2025 1')
    m.pdf.mockResolvedValueOnce({ pdfPath: 'x.pdf' } as never)
    m.readFile.mockRejectedValueOnce(new Error('ENOENT'))
    const b = await reportRun('리포트 2025 1')
    expect(a.steps[1]).toEqual(['reply', '⚠️ 리포트 생성에 실패했습니다.', 'plain'])
    expect(b.steps[1]).toEqual(['reply', '⚠️ 리포트 생성에 실패했습니다.', 'plain'])
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
    const a = await backtestRun('/backtest@MyBot')
    const b = await backtestRun('백테스트')
    expect(a.steps).toEqual(b.steps)
    expect(a.steps).toMatchSnapshot()
  })

  it('모르는 전략 · 기간 범위 밖', async () => {
    const outs = [
      (await backtestRun('백테스트 NVDA 마법')).steps,
      (await backtestRun('백테스트 NVDA rsi 29')).steps,
      (await backtestRun('백테스트 NVDA rsi 3651')).steps,
      (await backtestRun('백테스트 NVDA rsi abc')).steps,
    ]
    expect(outs).toMatchSnapshot()
    expect(m.backtest).not.toHaveBeenCalled()
  })

  it('실행 — 안내(html) → 결과(html) · 엔진 입력 · 별칭 · 기본 rsi 365 · typing 5 s', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(new Date('2026-10-30T00:00:00Z'))
    let resolve!: (v: unknown) => void
    m.backtest.mockImplementationOnce(() => new Promise((r) => { resolve = r }) as never)
    const f = await backtestRun('백테스트 nvda')
    const input = m.backtest.mock.calls[0][0] as { ticker: string; strategy: { name: string }; startDate: Date; endDate: Date }
    expect(input.ticker).toBe('NVDA')
    expect(input.endDate.toISOString()).toBe('2026-10-30T00:00:00.000Z')
    expect(input.startDate.toISOString()).toBe('2025-10-30T00:00:00.000Z')
    expect(m.backtest.mock.calls[0][0]).toMatchObject({ initialCapital: 10_000_000, positionSize: 0.9, commission: 0.0025 })
    vi.advanceTimersByTime(5000)
    expect(f.typing).toHaveBeenCalledTimes(1)
    resolve(RESULT)
    await flush()
    vi.advanceTimersByTime(20000)
    expect(f.typing).toHaveBeenCalledTimes(1)
    expect(f.steps).toMatchSnapshot()

    m.backtest.mockResolvedValueOnce({ ...RESULT, trades: [], metrics: { ...RESULT.metrics, profitFactor: 1.5 } } as never)
    const alias = await backtestRun('백테스트 AAPL 골든크로스 90')
    expect((m.backtest.mock.calls[1][0] as { strategy: unknown }).strategy).toBeDefined()
    expect(alias.steps).toMatchSnapshot()
  })

  // PR-2c (#396 · UQ-3) 이전: 어떤 오류든 원문을 그대로 보였다
  it('실패 — 엔진 안내(데이터 부족)는 그대로 · 그 밖의 원문은 정적 안내(PR-2c 수정)', async () => {
    m.backtest.mockRejectedValueOnce(new Error('데이터 부족: NEW (20일)'))
    const known = await backtestRun('백테스트 NEW')
    m.backtest.mockRejectedValueOnce(new Error('Yahoo 429 <html>'))
    const other = await backtestRun('백테스트 NEW')
    expect(known.steps[1]).toEqual(['reply', '⚠️ 백테스트 실패: 데이터 부족: NEW (20일)', 'plain'])
    expect(other.steps[1]).toEqual(['reply', '⚠️ 백테스트에 실패했습니다. 잠시 후 다시 시도해주세요.', 'plain'])
  })
})

describe('커스텀전략', () => {
  const PARSED = { name: '  SOXL 저점 ', ticker: 'SOXL', conditions: [{ type: 'price', op: 'lte', value: 40 }], logic: 'AND', frequency: 'once_daily' }

  it('등록 — 사용법 · 한도 · 파싱 중 → 등록 완료(html) · DB 입력', async () => {
    const usage = await registerRun('커스텀전략등록')
    p.customStrategy.count.mockResolvedValueOnce(50 as never)
    const full = await registerRun('커스텀전략등록 SOXL 40 이하')
    p.customStrategy.count.mockResolvedValueOnce(1 as never)
    m.parse.mockResolvedValueOnce(PARSED as never)
    p.customStrategy.create.mockResolvedValueOnce({ id: 'c'.repeat(19) + 'abc123', name: 'SOXL 저점', ticker: 'SOXL', frequency: 'once_daily' } as never)
    const ok = await registerRun('/customstrategy  SOXL 40달러 <이하> ')
    expect(m.parse).toHaveBeenCalledWith('SOXL 40달러 <이하>')
    expect(p.customStrategy.create.mock.calls[0][0]).toStrictEqual({
      data: { name: 'SOXL 저점', description: 'SOXL 40달러 <이하>', ticker: 'SOXL', conditions: PARSED.conditions, logic: 'AND', frequency: 'once_daily' },
    })
    expect([usage.steps, full.steps, ok.steps]).toMatchSnapshot()
  })

  // PR-2c (#396 · UQ-3) 이전: 어떤 오류든 원문(AI 응답 원문 줄 포함)을 그대로 보였다
  it('파싱 실패 — 파서 안내는 원문 줄을 떼고 · 그 밖의 원문은 정적 안내(PR-2c 수정)', async () => {
    const say = async (err: Error) => {
      p.customStrategy.count.mockResolvedValueOnce(0 as never)
      m.parse.mockRejectedValueOnce(err)
      return (await registerRun('커스텀전략등록 아무거나')).steps
    }
    const reason = await say(new Error('파싱 실패: 종목을 찾을 수 없음'))
    const raw = await say(new Error('AI 파싱 응답에 JSON 오브젝트가 없습니다. 표현을 바꿔서 재시도해주세요.\n원문: {"leak": "<x>"}'))
    const other = await say(new Error('Claude CLI 종료 코드: 1'))
    const second = (steps: Step[]) => steps[1][1]
    expect(second(reason)).toBe('⚠️ 전략 파싱 실패\n\n파싱 실패: 종목을 찾을 수 없음\n\n표현을 바꿔서 다시 시도해주세요.')
    expect(second(raw)).toBe('⚠️ 전략 파싱 실패\n\nAI 파싱 응답에 JSON 오브젝트가 없습니다. 표현을 바꿔서 재시도해주세요.\n\n표현을 바꿔서 다시 시도해주세요.')
    expect(second(other)).toBe('⚠️ 전략 파싱 실패\n\n전략을 해석하지 못했습니다.\n\n표현을 바꿔서 다시 시도해주세요.')
    expect(reason[0]).toEqual(['reply', '🤖 전략 파싱 중... (최대 60초)', 'plain'])
    expect(p.customStrategy.create).not.toHaveBeenCalled()
  })

  it('등록 — 처리 중 던지면 그대로 던진다(등록에 catch 없음)', async () => {
    p.customStrategy.count.mockRejectedValueOnce(new Error('db'))
    const r = recordingOutput()
    await expect(decideCustomStrategyRegister(customStrategyRegisterArgsFromText('커스텀전략등록 X'), r.out)).rejects.toThrow('db')
    expect(r.steps).toEqual([])
  })

  it('목록 — 없음 · 블록(html · 상태 · 최근 발동 · 조건 파싱 오류)', async () => {
    p.customStrategy.findMany.mockResolvedValueOnce([] as never)
    const empty = await run((out) => decideCustomStrategyList(out))
    p.customStrategy.findMany.mockResolvedValueOnce([
      { id: 'x'.repeat(19) + 'aaa111', name: 'A<1>', ticker: 'SOXL', conditions: [{ type: 'price', op: 'lte', value: 40 }], logic: 'AND', frequency: 'once_daily', isActive: true, lastTriggeredAt: new Date('2026-10-01T00:00:00Z') },
      { id: 'y'.repeat(19) + 'bbb222', name: 'B', ticker: 'NVDA', conditions: 'broken', logic: 'OR', frequency: 'every', isActive: false, lastTriggeredAt: null },
    ] as never)
    const list = await run((out) => decideCustomStrategyList(out))
    expect(p.customStrategy.findMany.mock.calls[0][0]).toStrictEqual({ orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }] })
    expect([empty.steps, list.steps]).toMatchSnapshot()
  })

  it('삭제 — 사용법 · 없음 · 여럿 · 삭제(plain) · endsWith 검색', async () => {
    const usage = await deleteRun('커스텀전략삭제')
    p.customStrategy.findMany.mockResolvedValueOnce([] as never)
    const none = await deleteRun('커스텀전략삭제 zz9')
    p.customStrategy.findMany.mockResolvedValueOnce([{ id: '1abc123', name: 'A', ticker: 'X' }, { id: '2abc123', name: 'B', ticker: 'Y' }] as never)
    const many = await deleteRun('커스텀전략삭제 abc123')
    p.customStrategy.findMany.mockResolvedValueOnce([{ id: 'idabc123', name: 'A<b>', ticker: 'X' }] as never)
    const ok = await deleteRun('/customstrategydelete abc123')
    expect(p.customStrategy.findMany.mock.calls[0][0]).toStrictEqual({ where: { id: { endsWith: 'zz9' } }, take: 5 })
    expect(p.customStrategy.delete.mock.calls[0][0]).toStrictEqual({ where: { id: 'idabc123' } })
    expect([usage.steps, none.steps, many.steps, ok.steps]).toMatchSnapshot()
  })
})

describe('알림설정', () => {
  const CONFIGS = [
    { key: 'price_drop_pct', label: '급락 <기준>', value: '-5' },
    { key: 'unknown_key', label: '기타', value: 'x&y' },
  ]

  it('/alertconfig 인자 없음 → 현황(html) · 없음', async () => {
    p.alertConfig.findMany.mockResolvedValueOnce(CONFIGS as never)
    const list = await alertCmd('/alertconfig')
    p.alertConfig.findMany.mockResolvedValueOnce([] as never)
    const none = await alertCmd('/alertconfig')
    expect(p.alertConfig.findMany.mock.calls[0][0]).toStrictEqual({ orderBy: { key: 'asc' } })
    expect([list.steps, none.steps]).toMatchSnapshot()
  })

  it('/alertconfig 인자 부족 · 모르는 항목 · 값 형식(숫자 · 토글) · 없는 설정', async () => {
    const outs = [
      (await alertCmd('/alertconfig 급락')).steps,
      (await alertCmd('/alertconfig 폭락 -3')).steps,
      (await alertCmd('/alertconfig 급락 많이')).steps,
      (await alertCmd('/alertconfig 능동리뷰 yes')).steps,
    ]
    p.alertConfig.findUnique.mockResolvedValueOnce(null as never)
    outs.push((await alertCmd('/alertconfig 급락 -3')).steps)
    expect(outs).toMatchSnapshot()
  })

  it('/alertconfig 변경 — 숫자 · 토글 소문자 정규화 · html', async () => {
    p.alertConfig.findUnique.mockResolvedValueOnce({ value: '-5' } as never)
    p.alertConfig.update.mockResolvedValueOnce({ label: '급락 <기준>', value: '-3' } as never)
    const num = await alertCmd('/alertconfig 급락 -3')
    p.alertConfig.findUnique.mockResolvedValueOnce({ value: 'off' } as never)
    p.alertConfig.update.mockResolvedValueOnce({ label: '능동 리뷰', value: 'on' } as never)
    const toggle = await alertCmd('/alertconfig 능동리뷰 ON')
    expect(p.alertConfig.update.mock.calls.map((c) => c[0])).toStrictEqual([
      { where: { key: 'price_drop_pct' }, data: { value: '-3' } },
      { where: { key: 'active_review' }, data: { value: 'on' } },
    ])
    expect([num.steps, toggle.steps]).toMatchSnapshot()
  })

  // PR-2c (#396 · UQ-3) 이전: 매치 배열 전체가 인자라 항목 = "알림설정" · 인자 없음이 인자 부족 안내였다(로컬 실측 2026-10-30)
  it('한글 "알림설정 급락 -3" → /alertconfig 와 같은 변경(PR-2c 수정)', async () => {
    p.alertConfig.findUnique.mockResolvedValueOnce({ value: '-5' } as never)
    p.alertConfig.update.mockResolvedValueOnce({ label: '급락 <기준>', value: '-3' } as never)
    const ko = await alertHears('알림설정 급락 -3')
    p.alertConfig.findUnique.mockResolvedValueOnce({ value: '-5' } as never)
    p.alertConfig.update.mockResolvedValueOnce({ label: '급락 <기준>', value: '-3' } as never)
    const en = await alertCmd('/alertconfig 급락 -3')
    expect(ko.steps).toEqual(en.steps)
    expect(p.alertConfig.update.mock.calls[0][0]).toStrictEqual({ where: { key: 'price_drop_pct' }, data: { value: '-3' } })
  })

  it('한글 "알림설정" 만 → 현황(PR-2c 수정)', async () => {
    p.alertConfig.findMany.mockResolvedValueOnce(CONFIGS as never)
    const ko = await alertHears('알림설정')
    p.alertConfig.findMany.mockResolvedValueOnce(CONFIGS as never)
    const en = await alertCmd('/alertconfig')
    expect(ko.steps).toEqual(en.steps)
    expect(String(ko.steps[0][1]).startsWith('⚙️ <b>알림 설정 현황</b>')).toBe(true)
  })

  // 정적 안내('⚠️ 알림 설정에 실패했습니다.')는 등록 핸들러의 try/catch 몫이다 — router 감싸기 테스트로 간다. 판단은 던진다.
  it('처리 중 던지면 정적 안내', async () => {
    p.alertConfig.findMany.mockRejectedValueOnce(new Error('db'))
    const r = recordingOutput()
    await expect(decideAlertConfig(alertArgsFromTelegram('', '/alertconfig'), r.out)).rejects.toThrow('db')
    expect(r.steps).toEqual([])
  })
})
