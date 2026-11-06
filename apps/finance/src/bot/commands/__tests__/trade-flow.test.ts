/**
 * pleiades 009 D-5 B3a (pleiades#509) — trade-telegram.test.ts 를 판단 단위로 옮겼다(어댑터 없음).
 *
 * 매수·매도 `decideTrade` · `trade:` 버튼 `decideTradeButton` 을 직접 부른다(T6 파싱·검증 · T7 `trade:` · T17 경계).
 * 옛 등록부(hears 정규식 · 콜백 next · 등록부 catch 문구)는 어댑터 몫이라 옮기지 않았다 — 대응표 `map-trade.md`.
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
import type { BotReply, Requester } from '../../core/reply'
import { decideTrade, decideTradeButton, tradeArgsFromText } from '../trade'
import { press, recordingButtons, recordingOutput, replyActions, requester, type Step } from './test-utils'

const mocked = {
  accounts: vi.mocked(prisma.account.findMany),
  priceFind: vi.mocked(prisma.priceCache.findUnique),
  priceMany: vi.mocked(prisma.priceCache.findMany),
  holdingFirst: vi.mocked(prisma.holding.findFirst),
  holdingFind: vi.mocked(prisma.holding.findUnique),
  createTrade: vi.mocked(createTrade),
}

const ACCOUNT = { id: 'a1', name: '세진' }
const AAPL = { ticker: 'AAPL', displayName: 'Apple', market: 'NASDAQ', currency: 'USD', price: 150, quoteName: 'Apple Inc.' }
const SAMSUNG = { ticker: '005930.KS', displayName: '삼성전자', market: 'KOSPI', currency: 'KRW', price: 70000, quoteName: 'Samsung' }

/** 등록부가 하던 대로 — 원문에서 인자를 벗겨 decideTrade 로. */
async function say(text: string, who: Requester = requester()) {
  const type = text.startsWith('매수') ? 'BUY' : 'SELL'
  const r = recordingOutput()
  await decideTrade(type, tradeArgsFromText(type, text), r.out, who)
  return r
}

/** 셋째 인자를 생략하면 본인 · `undefined` 를 넘기면 누른 사람 없음(`press` 와 같은 규칙 — 기본 인자 금지). */
async function click(data: string, messageKey: Parameters<typeof press>[0], ...clicker: [] | [string | undefined]) {
  const b = recordingButtons()
  await decideTradeButton(data, press(messageKey, ...clicker), b.out)
  return b
}

/** priceCache.findUnique 를 ticker 별로 답한다 — 'USDKRW=X' 는 fx. */
function priceTable(table: Record<string, unknown>) {
  mocked.priceFind.mockImplementation((async (args: { where: { ticker: string } }) => table[args.where.ticker] ?? null) as never)
}

/** KRW 매수 확인 메시지까지 — 버튼 action 의 tradeId 와 메시지 키. */
async function startBuy(who: Requester = requester()) {
  mocked.accounts.mockResolvedValueOnce([ACCOUNT] as never)
  priceTable({ '005930.KS': SAMSUNG })
  const r = await say('매수 세진 005930.ks 10 70000', who)
  return { tradeId: replyActions(r.steps)[0].split(':')[2], messageKey: r.keys[0], r }
}

beforeEach(() => {
  for (const m of Object.values(mocked)) m.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => vi.useRealTimers())

describe('T6 매수·매도 파싱·검증', () => {
  it('인자 없음 → 사용법', async () => {
    const r = await say('매도')
    expect(r.steps).toEqual([
      ['reply', '사용법: 매도 [계좌] [종목] [수량] [가격]\n예: 매도 세진 AAPL 10 150\n예: 매도 소담 TIGER미국S&P500 5 18500', 'plain'],
    ])
  })

  it.each([
    ['매수 세진 AAPL 10', '⚠️ 입력이 부족합니다.\n사용법: 매수 [계좌] [종목] [수량] [가격]\n예: 매수 세진 AAPL 10 150'],
    ['매수 세진 AAPL 0 150', '⚠️ 수량은 1 이상의 정수여야 합니다: 0'],
    ['매수 세진 AAPL 10주 150', '⚠️ 수량은 1 이상의 정수여야 합니다: 10주'],
    ['매수 세진 AAPL 10 150원', '⚠️ 가격은 0보다 큰 숫자여야 합니다: 150원'],
    ['매수 세진 AAPL 10 0', '⚠️ 가격은 0보다 큰 숫자여야 합니다: 0'],
  ])('%s → 검증 안내 · DB 무접촉', async (text, msg) => {
    const r = await say(text)
    expect(r.steps).toEqual([['reply', msg, 'plain']])
    expect(mocked.accounts).not.toHaveBeenCalled()
  })

  // PR-2c (#396 · UQ-3) 이전: plain 안내가 escapeHtml 을 거쳐 & 가 &amp; 로 보였다
  it('계좌 없음 안내(plain)는 escape 하지 않는다(PR-2c 수정)', async () => {
    mocked.accounts.mockResolvedValueOnce([]).mockResolvedValueOnce([{ name: 'A&B' }, { name: '소담' }] as never)
    const r = await say('매수 없는<계좌> AAPL 1 150')
    expect(r.steps).toEqual([['reply', '⚠️ 계좌를 찾을 수 없습니다: 없는<계좌>\n사용 가능: A&B, 소담', 'plain']])
    expect(mocked.accounts.mock.calls[0][0]).toEqual({ where: { name: '없는<계좌>' }, take: 2 })
  })

  it('같은 이름 계좌 2개 → 안내', async () => {
    mocked.accounts.mockResolvedValueOnce([ACCOUNT, ACCOUNT] as never)
    const r = await say('매수 세진 AAPL 1 150')
    expect(r.steps).toEqual([['reply', '⚠️ 동일 이름의 계좌가 여러 개 있습니다. 관리자에게 문의해주세요.', 'plain']])
  })

  it('종목명 여러 개 매칭 → 후보 안내', async () => {
    mocked.accounts.mockResolvedValueOnce([ACCOUNT] as never)
    priceTable({})
    mocked.priceMany.mockResolvedValueOnce([
      { ...SAMSUNG, ticker: 'A' },
      { ...SAMSUNG, ticker: 'B' },
    ] as never)
    const r = await say('매수 세진 삼성 전자 1 70000')
    expect(mocked.priceMany.mock.calls[0][0]).toEqual({
      where: { displayName: { equals: '삼성 전자', mode: 'insensitive' } },
      take: 2,
    })
    expect(r.steps).toEqual([['reply', '여러 종목이 매칭됩니다:\n  삼성전자 (A)\n  삼성전자 (B)\n\n티커를 입력해주세요.', 'plain']])
  })

  it('후보 안내(plain)는 escape 하지 않는다(PR-2c 수정 · 이전에는 & → &amp;)', async () => {
    mocked.accounts.mockResolvedValueOnce([ACCOUNT] as never)
    priceTable({})
    mocked.priceMany.mockResolvedValueOnce([
      { ...SAMSUNG, displayName: 'S&P <500>', ticker: 'A' },
      { ...SAMSUNG, displayName: 'S&P <500>', ticker: 'B' },
    ] as never)
    const r = await say('매수 세진 S&P 1 70000')
    expect(r.steps).toEqual([['reply', '여러 종목이 매칭됩니다:\n  S&P <500> (A)\n  S&P <500> (B)\n\n티커를 입력해주세요.', 'plain']])
  })

  it('PriceCache 에 없으면 그 계좌 보유 종목에서 · 그래도 없으면 안내', async () => {
    mocked.accounts.mockResolvedValueOnce([ACCOUNT] as never)
    priceTable({})
    mocked.priceMany.mockResolvedValueOnce([])
    mocked.holdingFirst.mockResolvedValueOnce(null)
    const r = await say('매수 세진 없는종목 1 100')
    expect(mocked.holdingFirst.mock.calls[0][0]).toEqual({
      where: {
        accountId: 'a1',
        OR: [{ ticker: '없는종목' }, { displayName: { equals: '없는종목', mode: 'insensitive' } }],
      },
    })
    expect(r.steps).toEqual([['reply', '⚠️ 종목을 찾을 수 없습니다: 없는종목', 'plain']])
  })

  it('매도 — 보유 수량 초과 안내', async () => {
    mocked.accounts.mockResolvedValueOnce([ACCOUNT] as never)
    priceTable({ '005930.KS': SAMSUNG })
    mocked.holdingFind.mockResolvedValueOnce({ shares: 3 } as never)
    const r = await say('매도 세진 005930.KS 5 70000')
    expect(mocked.holdingFind.mock.calls[0][0]).toEqual({ where: { accountId_ticker: { accountId: 'a1', ticker: '005930.KS' } } })
    expect(r.steps).toEqual([['reply', '⚠️ 보유 수량(3주)을 초과합니다.', 'plain']])
  })

  it('USD — 환율 없음 · 비정상', async () => {
    mocked.accounts.mockResolvedValue([ACCOUNT] as never)
    priceTable({ AAPL })
    const r1 = await say('매수 세진 AAPL 1 150')
    expect(r1.steps).toEqual([['reply', '⚠️ 환율 데이터가 없습니다. 주가 갱신을 확인해주세요.', 'plain']])
    priceTable({ AAPL, 'USDKRW=X': { price: 0 } })
    const r2 = await say('매수 세진 AAPL 1 150')
    expect(r2.steps).toEqual([['reply', '⚠️ 환율 데이터가 비정상입니다. 주가 갱신을 확인해주세요.', 'plain']])
  })

  it('USD 확인 미리보기 — HTML · 환율 줄 · 확인/취소 한 행', async () => {
    mocked.accounts.mockResolvedValueOnce([ACCOUNT] as never)
    priceTable({ AAPL, 'USDKRW=X': { price: 1400 } })
    const r = await say('매수 세진 aapl 2 150.5')
    expect(r.steps).toHaveLength(1)
    const [name, text, format, rows] = r.steps[0] as [string, string, string, unknown]
    expect(name).toBe('reply')
    expect(format).toBe('html')
    // 옛 `Object.keys(opts) = [parse_mode, reply_markup]` — 판단 출력은 text · format · buttons 만
    const sent = vi.mocked(r.out.reply).mock.calls[0][0] as BotReply
    expect(Object.keys(sent)).toEqual(['text', 'format', 'buttons'])
    expect(text.split('\n')[0]).toBe('<b>📥 매수 확인</b>')
    expect(text).toContain('계좌: 세진\n종목: Apple (AAPL)\n')
    expect(text).toContain('수량: 2주\n단가: $150.50\n환율: ₩1400.00\n<b>총액</b>: ₩421,400\n\n거래를 기록하시겠습니까?')
    const id = replyActions(r.steps)[0].split(':')[2]
    expect(rows).toEqual([[['✅ 확인', `trade:confirm:${id}`], ['❌ 취소', `trade:cancel:${id}`]]])
  })

  it('처리 중 예외 → 매수·매도 실패 안내', async () => {
    // 판단 몫만 — DB 예외는 판단 밖으로 던진다(실패 안내 문구는 감싸는 쪽의 일)
    mocked.accounts.mockRejectedValue(new Error('db'))
    const buy = recordingOutput()
    await expect(decideTrade('BUY', tradeArgsFromText('BUY', '매수 세진 AAPL 1 150'), buy.out, requester())).rejects.toThrow('db')
    expect(buy.steps).toEqual([])
    const sell = recordingOutput()
    await expect(decideTrade('SELL', tradeArgsFromText('SELL', '매도 세진 AAPL 1 150'), sell.out, requester())).rejects.toThrow('db')
    expect(sell.steps).toEqual([])
  })
})

describe('T7 trade: 콜백', () => {
  it('confirm → createTrade(입력 그대로 · 확정 시각) → 토스트 · 버튼 제거 · HTML 본문', async () => {
    const { tradeId, messageKey } = await startBuy()
    mocked.createTrade.mockResolvedValueOnce({ trade: { totalKRW: 700000 }, holding: { shares: 12 } } as never)
    const b = await click(`trade:confirm:${tradeId}`, messageKey)
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
    expect(b.steps).toEqual([
      ['toast', '거래 기록 완료!'],
      ['removeButtons'],
      ['edit', '✅ <b>📥 매수 완료</b>\n\n삼성전자 (005930.KS)\n10주 × ₩70,000\n<b>총액</b>: ₩700,000\n보유: 12주', 'html'],
    ])
    const again = await click(`trade:confirm:${tradeId}`, messageKey)
    expect(again.steps).toEqual([['toast', '⚠️ 만료된 거래입니다.'], ['removeButtons']])
  })

  it('confirm — 전량 매도 문구', async () => {
    const { tradeId, messageKey } = await startBuy()
    mocked.createTrade.mockResolvedValueOnce({ trade: { totalKRW: 1 }, holding: null } as never)
    const b = await click(`trade:confirm:${tradeId}`, messageKey)
    expect((b.steps[2][1] as string).endsWith('\n전량 매도 (보유 0주)')).toBe(true)
  })

  it.each([
    ['보유 수량 부족: 3주', '보유 수량 부족: 3주'],
    ['이미 처리된 거래', '이미 처리된 거래'],
    ['connection refused secret', '거래 기록에 실패했습니다.'],
  ])('confirm 실패 %s → 비즈니스 오류만 원문', async (raw, shown) => {
    const { tradeId, messageKey } = await startBuy()
    mocked.createTrade.mockRejectedValueOnce(new Error(raw))
    const b = await click(`trade:confirm:${tradeId}`, messageKey)
    expect(b.steps).toEqual([
      ['toast', `⚠️ ${shown}`],
      ['removeButtons'],
      ['edit', `⚠️ 거래 실패: ${shown}`, 'plain'],
    ])
  })

  // PR-2c (#396 · UQ-3) 이전: 본문 교체 실패가 catch 로 가 기록된 거래에 "거래 실패" 를 이어 보냈다
  it('기록 뒤 본문 교체가 실패해도 "거래 실패" 를 보내지 않는다 — 로그만(PR-2c 수정)', async () => {
    const { tradeId, messageKey } = await startBuy()
    mocked.createTrade.mockResolvedValueOnce({ trade: { totalKRW: 1 }, holding: null } as never)
    const b = recordingButtons()
    vi.mocked(b.out.edit).mockImplementationOnce(async (message: BotReply) => {
      b.steps.push(['edit', message.text, message.format])
      throw new Error('discord 400')
    })
    await decideTradeButton(`trade:confirm:${tradeId}`, press(messageKey), b.out)
    expect(b.steps.map((s: Step) => s[0])).toEqual(['toast', 'removeButtons', 'edit'])
    expect(b.steps[0]).toEqual(['toast', '거래 기록 완료!'])
    expect(console.error).toHaveBeenCalledWith('[bot] 거래 기록 뒤 원본 수정 실패(기록은 됨):', expect.any(Error))
    expect(mocked.createTrade).toHaveBeenCalledTimes(1)
  })

  it('기록 뒤 토스트가 실패해도 버튼 제거·본문 교체는 돈다 — 결과가 화면에 남는다(9-1 리뷰 major)', async () => {
    const { tradeId, messageKey } = await startBuy()
    mocked.createTrade.mockResolvedValueOnce({ trade: { totalKRW: 700000 }, holding: { shares: 10 } } as never)
    const b = recordingButtons()
    vi.mocked(b.out.toast).mockImplementationOnce(async (text?: string) => {
      b.steps.push(['toast', text])
      throw new Error('query is too old')
    })
    await decideTradeButton(`trade:confirm:${tradeId}`, press(messageKey), b.out)
    expect(b.steps.map((s: Step) => s[0])).toEqual(['toast', 'removeButtons', 'edit'])
    expect(String(b.steps[2][1]).startsWith('✅ <b>📥 매수 완료</b>')).toBe(true)
  })

  it('cancel → 세 호출 순서', async () => {
    const { tradeId, messageKey } = await startBuy()
    const b = await click(`trade:cancel:${tradeId}`, messageKey)
    expect(b.steps).toEqual([
      ['toast', '취소되었습니다.'],
      ['removeButtons'],
      ['edit', '❌ 거래가 취소되었습니다.', 'plain'],
    ])
  })

  it('본인 아님 → 거부 · 상태 되돌림 · T17 from 없음 → 거부', async () => {
    const { tradeId, messageKey } = await startBuy()
    const other = await click(`trade:cancel:${tradeId}`, messageKey, '99')
    expect(other.steps).toEqual([['toast', '⚠️ 본인만 확인/취소할 수 있습니다.']])
    const anon = await click(`trade:cancel:${tradeId}`, messageKey, undefined)
    expect(anon.steps).toEqual([['toast', '⚠️ 본인만 확인/취소할 수 있습니다.']])
    const own = await click(`trade:cancel:${tradeId}`, messageKey)
    expect(own.steps[0]).toEqual(['toast', '취소되었습니다.'])
  })

  it('T17 요청에 from 이 없었으면 아무도 확정할 수 없다', async () => {
    // 옛 어댑터의 요청자 = String(from?.id ?? 0) → '0'. 누른 사람 '7' 은 그 주인이 아니다
    const { tradeId, messageKey } = await startBuy(requester('0'))
    const b = await click(`trade:confirm:${tradeId}`, messageKey)
    expect(b.steps).toEqual([['toast', '⚠️ 본인만 확인/취소할 수 있습니다.']])
    expect(mocked.createTrade).not.toHaveBeenCalled()
  })

  it('시간 만료 → 만료 안내 · 버튼 제거', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-29T00:00:00Z'))
    const { tradeId, messageKey } = await startBuy()
    vi.setSystemTime(new Date('2026-10-29T00:05:01Z'))
    const b = await click(`trade:confirm:${tradeId}`, messageKey)
    expect(b.steps).toEqual([['toast', '⚠️ 거래가 만료되었습니다.'], ['removeButtons']])
  })

  it('메시지 없음 → 안내 · trade: 가 아니면 next · 던지면 오류 토스트', async () => {
    // 판단 몫만 — 메시지 키 없음 안내 · trade: 가 아닌 data 는 출력 없음. next · 오류 토스트는 감싸는 쪽의 일
    const b1 = await click('trade:confirm:x', undefined)
    expect(b1.steps).toEqual([['toast', '⚠️ 메시지를 찾을 수 없습니다.']])
    const b2 = await click('vest:confirm:x', 'discord:c1:1' as Parameters<typeof press>[0])
    expect(b2.steps).toEqual([])

    // 출력이 던지면 판단 밖으로 나간다(오류 토스트 문구는 감싸는 쪽)
    const { tradeId, messageKey } = await startBuy()
    const b3 = recordingButtons()
    vi.mocked(b3.out.toast).mockImplementationOnce(async () => {
      throw new Error('discord')
    })
    await expect(decideTradeButton(`trade:cancel:${tradeId}`, press(messageKey), b3.out)).rejects.toThrow('discord')
    expect(b3.steps).toEqual([])
  })
})
