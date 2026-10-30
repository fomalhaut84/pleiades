/**
 * pleiades 009 D-3 PR-1a (pleiades#382) — 매수·매도 · `trade:` 텔레그램 특성 테스트(T6 파싱·검증 · T7 `trade:` · T17 경계).
 *
 * 판단 분리 **전** 코드에서 먼저 통과시키고, 분리 뒤에도 grammY 호출열이 같아야 한다(설계 §4 B · T).
 * "현재 동작" 이라 적은 테스트는 서비스 유래 결함을 그대로 고정한다(plain 응답 속 `escapeHtml` · 확정 뒤 원본 수정 실패의 "거래 실패" — UQ-3).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    account: { findMany: vi.fn() },
    priceCache: { findUnique: vi.fn(), findMany: vi.fn() },
    holding: { findFirst: vi.fn(), findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/trade-service', () => ({ createTrade: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { createTrade } from '@/lib/trade-service'
import { registerTradeCommands } from '../trade'
import { captureBot, fakeCtx, replyButtons, rowsOf, type FakeCtxOptions } from './telegram-fake'

const mocked = {
  accounts: vi.mocked(prisma.account.findMany),
  priceFind: vi.mocked(prisma.priceCache.findUnique),
  priceMany: vi.mocked(prisma.priceCache.findMany),
  holdingFirst: vi.mocked(prisma.holding.findFirst),
  holdingFind: vi.mocked(prisma.holding.findUnique),
  createTrade: vi.mocked(createTrade),
}

const bot = captureBot(registerTradeCommands)
const [buyHears, sellHears] = bot.hears
const callback = bot.on[0]

const ACCOUNT = { id: 'a1', name: '세진' }
const AAPL = { ticker: 'AAPL', displayName: 'Apple', market: 'NASDAQ', currency: 'USD', price: 150, quoteName: 'Apple Inc.' }
const SAMSUNG = { ticker: '005930.KS', displayName: '삼성전자', market: 'KOSPI', currency: 'KRW', price: 70000, quoteName: 'Samsung' }

async function say(hears: typeof buyHears, text: string, opts: FakeCtxOptions = {}) {
  const f = fakeCtx({ text, ...opts })
  await hears.handler(f.ctx, vi.fn())
  return f
}

async function press(data: string, messageId: number, opts: FakeCtxOptions = {}) {
  const f = fakeCtx({ data, messageId, ...opts })
  const next = vi.fn(async () => undefined)
  await callback.handler(f.ctx, next)
  return { ...f, next }
}

/** priceCache.findUnique 를 ticker 별로 답한다 — 'USDKRW=X' 는 fx. */
function priceTable(table: Record<string, unknown>) {
  mocked.priceFind.mockImplementation((async (args: { where: { ticker: string } }) => table[args.where.ticker] ?? null) as never)
}

/** KRW 매수 확인 메시지까지 — 버튼 data 와 메시지 id. */
async function startBuy(opts: FakeCtxOptions = {}) {
  mocked.accounts.mockResolvedValueOnce([ACCOUNT] as never)
  priceTable({ '005930.KS': SAMSUNG })
  const f = await say(buyHears, '매수 세진 005930.ks 10 70000', opts)
  const data = replyButtons(f.calls)
  return { tradeId: data[0].split(':')[2], messageId: f.sentIds[0], f }
}

beforeEach(() => {
  for (const m of Object.values(mocked)) m.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => vi.useRealTimers())

describe('등록', () => {
  it('매수 · 매도 hears 순서와 정규식 · 콜백 on 하나', () => {
    expect(bot.hears.map((x) => x.re.source)).toEqual(['^매수(?:\\s+.*)?$', '^매도(?:\\s+.*)?$'])
    expect(bot.on.map((x) => x.filter)).toEqual(['callback_query:data'])
    expect(buyHears.re.test('매수수수료')).toBe(false)
    expect(buyHears.re.test('매수')).toBe(true)
  })
})

describe('T6 매수·매도 파싱·검증', () => {
  it('인자 없음 → 사용법', async () => {
    const f = await say(sellHears, '매도')
    expect(f.calls).toEqual([
      ['reply', '사용법: 매도 [계좌] [종목] [수량] [가격]\n예: 매도 세진 AAPL 10 150\n예: 매도 소담 TIGER미국S&P500 5 18500'],
    ])
  })

  it.each([
    ['매수 세진 AAPL 10', '⚠️ 입력이 부족합니다.\n사용법: 매수 [계좌] [종목] [수량] [가격]\n예: 매수 세진 AAPL 10 150'],
    ['매수 세진 AAPL 0 150', '⚠️ 수량은 1 이상의 정수여야 합니다: 0'],
    ['매수 세진 AAPL 10주 150', '⚠️ 수량은 1 이상의 정수여야 합니다: 10주'],
    ['매수 세진 AAPL 10 150원', '⚠️ 가격은 0보다 큰 숫자여야 합니다: 150원'],
    ['매수 세진 AAPL 10 0', '⚠️ 가격은 0보다 큰 숫자여야 합니다: 0'],
  ])('%s → 검증 안내 · DB 무접촉', async (text, msg) => {
    const f = await say(buyHears, text)
    expect(f.calls).toEqual([['reply', msg]])
    expect(mocked.accounts).not.toHaveBeenCalled()
  })

  // PR-2c (#396 · UQ-3) 이전: plain 안내가 escapeHtml 을 거쳐 & 가 &amp; 로 보였다
  it('계좌 없음 안내(plain)는 escape 하지 않는다(PR-2c 수정)', async () => {
    mocked.accounts.mockResolvedValueOnce([]).mockResolvedValueOnce([{ name: 'A&B' }, { name: '소담' }] as never)
    const f = await say(buyHears, '매수 없는<계좌> AAPL 1 150')
    expect(f.calls).toEqual([['reply', '⚠️ 계좌를 찾을 수 없습니다: 없는<계좌>\n사용 가능: A&B, 소담']])
    expect(mocked.accounts.mock.calls[0][0]).toEqual({ where: { name: '없는<계좌>' }, take: 2 })
  })

  it('같은 이름 계좌 2개 → 안내', async () => {
    mocked.accounts.mockResolvedValueOnce([ACCOUNT, ACCOUNT] as never)
    const f = await say(buyHears, '매수 세진 AAPL 1 150')
    expect(f.calls).toEqual([['reply', '⚠️ 동일 이름의 계좌가 여러 개 있습니다. 관리자에게 문의해주세요.']])
  })

  it('종목명 여러 개 매칭 → 후보 안내', async () => {
    mocked.accounts.mockResolvedValueOnce([ACCOUNT] as never)
    priceTable({})
    mocked.priceMany.mockResolvedValueOnce([
      { ...SAMSUNG, ticker: 'A' },
      { ...SAMSUNG, ticker: 'B' },
    ] as never)
    const f = await say(buyHears, '매수 세진 삼성 전자 1 70000')
    expect(mocked.priceMany.mock.calls[0][0]).toEqual({
      where: { displayName: { equals: '삼성 전자', mode: 'insensitive' } },
      take: 2,
    })
    expect(f.calls).toEqual([['reply', '여러 종목이 매칭됩니다:\n  삼성전자 (A)\n  삼성전자 (B)\n\n티커를 입력해주세요.']])
  })

  it('후보 안내(plain)는 escape 하지 않는다(PR-2c 수정 · 이전에는 & → &amp;)', async () => {
    mocked.accounts.mockResolvedValueOnce([ACCOUNT] as never)
    priceTable({})
    mocked.priceMany.mockResolvedValueOnce([
      { ...SAMSUNG, displayName: 'S&P <500>', ticker: 'A' },
      { ...SAMSUNG, displayName: 'S&P <500>', ticker: 'B' },
    ] as never)
    const f = await say(buyHears, '매수 세진 S&P 1 70000')
    expect(f.calls).toEqual([['reply', '여러 종목이 매칭됩니다:\n  S&P <500> (A)\n  S&P <500> (B)\n\n티커를 입력해주세요.']])
  })

  it('PriceCache 에 없으면 그 계좌 보유 종목에서 · 그래도 없으면 안내', async () => {
    mocked.accounts.mockResolvedValueOnce([ACCOUNT] as never)
    priceTable({})
    mocked.priceMany.mockResolvedValueOnce([])
    mocked.holdingFirst.mockResolvedValueOnce(null)
    const f = await say(buyHears, '매수 세진 없는종목 1 100')
    expect(mocked.holdingFirst.mock.calls[0][0]).toEqual({
      where: {
        accountId: 'a1',
        OR: [{ ticker: '없는종목' }, { displayName: { equals: '없는종목', mode: 'insensitive' } }],
      },
    })
    expect(f.calls).toEqual([['reply', '⚠️ 종목을 찾을 수 없습니다: 없는종목']])
  })

  it('매도 — 보유 수량 초과 안내', async () => {
    mocked.accounts.mockResolvedValueOnce([ACCOUNT] as never)
    priceTable({ '005930.KS': SAMSUNG })
    mocked.holdingFind.mockResolvedValueOnce({ shares: 3 } as never)
    const f = await say(sellHears, '매도 세진 005930.KS 5 70000')
    expect(mocked.holdingFind.mock.calls[0][0]).toEqual({ where: { accountId_ticker: { accountId: 'a1', ticker: '005930.KS' } } })
    expect(f.calls).toEqual([['reply', '⚠️ 보유 수량(3주)을 초과합니다.']])
  })

  it('USD — 환율 없음 · 비정상', async () => {
    mocked.accounts.mockResolvedValue([ACCOUNT] as never)
    priceTable({ AAPL })
    const f1 = await say(buyHears, '매수 세진 AAPL 1 150')
    expect(f1.calls).toEqual([['reply', '⚠️ 환율 데이터가 없습니다. 주가 갱신을 확인해주세요.']])
    priceTable({ AAPL, 'USDKRW=X': { price: 0 } })
    const f2 = await say(buyHears, '매수 세진 AAPL 1 150')
    expect(f2.calls).toEqual([['reply', '⚠️ 환율 데이터가 비정상입니다. 주가 갱신을 확인해주세요.']])
  })

  it('USD 확인 미리보기 — HTML · 환율 줄 · 확인/취소 한 행', async () => {
    mocked.accounts.mockResolvedValueOnce([ACCOUNT] as never)
    priceTable({ AAPL, 'USDKRW=X': { price: 1400 } })
    const f = await say(buyHears, '매수 세진 aapl 2 150.5')
    expect(f.calls).toHaveLength(1)
    const [name, text, opts] = f.calls[0] as [string, string, { parse_mode: string; reply_markup: unknown }]
    expect(name).toBe('reply')
    expect(opts.parse_mode).toBe('HTML')
    expect(Object.keys(opts)).toEqual(['parse_mode', 'reply_markup'])
    expect(text.split('\n')[0]).toBe('<b>📥 매수 확인</b>')
    expect(text).toContain('계좌: 세진\n종목: Apple (AAPL)\n')
    expect(text).toContain('수량: 2주\n단가: $150.50\n환율: ₩1400.00\n<b>총액</b>: ₩421,400\n\n거래를 기록하시겠습니까?')
    const id = replyButtons(f.calls)[0].split(':')[2]
    expect(rowsOf(opts.reply_markup)).toEqual([[['✅ 확인', `trade:confirm:${id}`], ['❌ 취소', `trade:cancel:${id}`]]])
  })

  it('처리 중 예외 → 매수·매도 실패 안내', async () => {
    mocked.accounts.mockRejectedValue(new Error('db'))
    expect((await say(buyHears, '매수 세진 AAPL 1 150')).calls).toEqual([['reply', '⚠️ 매수 기록에 실패했습니다.']])
    expect((await say(sellHears, '매도 세진 AAPL 1 150')).calls).toEqual([['reply', '⚠️ 매도 기록에 실패했습니다.']])
  })
})

describe('T7 trade: 콜백', () => {
  it('confirm → createTrade(입력 그대로 · 확정 시각) → 토스트 · 버튼 제거 · HTML 본문', async () => {
    const { tradeId, messageId } = await startBuy()
    mocked.createTrade.mockResolvedValueOnce({ trade: { totalKRW: 700000 }, holding: { shares: 12 } } as never)
    const r = await press(`trade:confirm:${tradeId}`, messageId)
    const input = mocked.createTrade.mock.calls[0][0]
    expect(input).toMatchObject({
      accountId: 'a1',
      ticker: '005930.KS',
      displayName: '삼성전자',
      market: 'KOSPI',
      type: 'BUY',
      shares: 10,
      price: 70000,
      currency: 'KRW',
      fxRate: null,
    })
    expect(input.tradedAt).toBeInstanceOf(Date)
    expect(r.calls).toEqual([
      ['answerCallbackQuery', { text: '거래 기록 완료!' }],
      ['editMessageReplyMarkup', { reply_markup: undefined }],
      [
        'editMessageText',
        '✅ <b>📥 매수 완료</b>\n\n삼성전자 (005930.KS)\n10주 × ₩70,000\n<b>총액</b>: ₩700,000\n보유: 12주',
        { parse_mode: 'HTML' },
      ],
    ])
    const again = await press(`trade:confirm:${tradeId}`, messageId)
    expect(again.calls).toEqual([
      ['answerCallbackQuery', { text: '⚠️ 만료된 거래입니다.' }],
      ['editMessageReplyMarkup', { reply_markup: undefined }],
    ])
  })

  it('confirm — 전량 매도 문구', async () => {
    const { tradeId, messageId } = await startBuy()
    mocked.createTrade.mockResolvedValueOnce({ trade: { totalKRW: 1 }, holding: null } as never)
    const r = await press(`trade:confirm:${tradeId}`, messageId)
    expect((r.calls[2][1] as string).endsWith('\n전량 매도 (보유 0주)')).toBe(true)
  })

  it.each([
    ['보유 수량 부족: 3주', '보유 수량 부족: 3주'],
    ['이미 처리된 거래', '이미 처리된 거래'],
    ['connection refused secret', '거래 기록에 실패했습니다.'],
  ])('confirm 실패 %s → 비즈니스 오류만 원문', async (raw, shown) => {
    const { tradeId, messageId } = await startBuy()
    mocked.createTrade.mockRejectedValueOnce(new Error(raw))
    const r = await press(`trade:confirm:${tradeId}`, messageId)
    expect(r.calls).toEqual([
      ['answerCallbackQuery', { text: `⚠️ ${shown}` }],
      ['editMessageReplyMarkup', { reply_markup: undefined }],
      ['editMessageText', `⚠️ 거래 실패: ${shown}`],
    ])
  })

  // PR-2c (#396 · UQ-3) 이전: 본문 교체 실패가 catch 로 가 기록된 거래에 "거래 실패" 를 이어 보냈다
  it('기록 뒤 본문 교체가 실패해도 "거래 실패" 를 보내지 않는다 — 로그만(PR-2c 수정)', async () => {
    const { tradeId, messageId } = await startBuy()
    mocked.createTrade.mockResolvedValueOnce({ trade: { totalKRW: 1 }, holding: null } as never)
    const f = fakeCtx({ data: `trade:confirm:${tradeId}`, messageId })
    f.ctx.editMessageText.mockImplementationOnce(async (...args: unknown[]) => {
      f.calls.push(['editMessageText', ...args])
      throw new Error('telegram 400')
    })
    await callback.handler(f.ctx, vi.fn())
    expect(f.calls.map((c) => c[0])).toEqual(['answerCallbackQuery', 'editMessageReplyMarkup', 'editMessageText'])
    expect(f.calls[0]).toEqual(['answerCallbackQuery', { text: '거래 기록 완료!' }])
    expect(console.error).toHaveBeenCalledWith('[bot] 거래 기록 뒤 원본 수정 실패(기록은 됨):', expect.any(Error))
    expect(mocked.createTrade).toHaveBeenCalledTimes(1)
  })

  it('cancel → 세 호출 순서', async () => {
    const { tradeId, messageId } = await startBuy()
    const r = await press(`trade:cancel:${tradeId}`, messageId)
    expect(r.calls).toEqual([
      ['answerCallbackQuery', { text: '취소되었습니다.' }],
      ['editMessageReplyMarkup', { reply_markup: undefined }],
      ['editMessageText', '❌ 거래가 취소되었습니다.'],
    ])
  })

  it('본인 아님 → 거부 · 상태 되돌림 · T17 from 없음 → 거부', async () => {
    const { tradeId, messageId } = await startBuy()
    const other = await press(`trade:cancel:${tradeId}`, messageId, { fromId: 99 })
    expect(other.calls).toEqual([['answerCallbackQuery', { text: '⚠️ 본인만 확인/취소할 수 있습니다.' }]])
    const anon = await press(`trade:cancel:${tradeId}`, messageId, { fromId: undefined })
    expect(anon.calls).toEqual([['answerCallbackQuery', { text: '⚠️ 본인만 확인/취소할 수 있습니다.' }]])
    const own = await press(`trade:cancel:${tradeId}`, messageId)
    expect(own.calls[0]).toEqual(['answerCallbackQuery', { text: '취소되었습니다.' }])
  })

  it('T17 요청에 from 이 없었으면 아무도 확정할 수 없다', async () => {
    const { tradeId, messageId } = await startBuy({ fromId: undefined })
    const r = await press(`trade:confirm:${tradeId}`, messageId)
    expect(r.calls).toEqual([['answerCallbackQuery', { text: '⚠️ 본인만 확인/취소할 수 있습니다.' }]])
    expect(mocked.createTrade).not.toHaveBeenCalled()
  })

  it('시간 만료 → 만료 안내 · 버튼 제거', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-29T00:00:00Z'))
    const { tradeId, messageId } = await startBuy()
    vi.setSystemTime(new Date('2026-10-29T00:05:01Z'))
    const r = await press(`trade:confirm:${tradeId}`, messageId)
    expect(r.calls).toEqual([
      ['answerCallbackQuery', { text: '⚠️ 거래가 만료되었습니다.' }],
      ['editMessageReplyMarkup', { reply_markup: undefined }],
    ])
  })

  it('메시지 없음 → 안내 · trade: 가 아니면 next · 던지면 오류 토스트', async () => {
    const r1 = await press('trade:confirm:x', 1, { messageId: null })
    expect(r1.calls).toEqual([['answerCallbackQuery', { text: '⚠️ 메시지를 찾을 수 없습니다.' }]])
    const r2 = await press('vest:confirm:x', 1)
    expect(r2.next).toHaveBeenCalledTimes(1)
    expect(r2.calls).toEqual([])

    const { tradeId, messageId } = await startBuy()
    const f = fakeCtx({ data: `trade:cancel:${tradeId}`, messageId })
    f.ctx.answerCallbackQuery.mockImplementationOnce(async () => {
      throw new Error('telegram')
    })
    await callback.handler(f.ctx, vi.fn())
    expect(f.calls).toEqual([['answerCallbackQuery', { text: '⚠️ 처리 중 오류가 발생했습니다.' }]])
  })
})
