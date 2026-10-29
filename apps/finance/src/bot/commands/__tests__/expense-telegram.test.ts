/**
 * pleiades 009 D-3 PR-1a (pleiades#382) — 소비 입력·`tx:`·`multi:` 텔레그램 특성 테스트.
 *
 * 판단 분리(설계 `_workspace/009/d3/02_writer_d3_r3.md` §4 H2 · B · S) **전** 코드에서 먼저 통과시키고, 분리 뒤에도 그대로 통과해야 한다.
 * 기준은 결과 상태가 아니라 **grammY 호출열 동등**(이름 · 인자 · 순서 — `tx:cancel` 의 두 호출 포함).
 * 덮는 지점: T1 자유 텍스트 거름 순서 · T2 금액 토큰 분기 · T3 파서 오류 · T4 카테고리 경로 4 + 키보드 모양 ·
 * T5 `tx:` 5 동작 + 만료·본인·중복 · T6 `multi:`(확정 행 `transactedAt` = 파싱 날짜) · T15 복수 파싱 · T16 `수입 …` · T17 `from` 없음 = 거부.
 * "현재 동작" 이라 적은 테스트는 서비스 유래 결함을 그대로 고정한다(D3-R2 · UQ-3 — 고칠 때 별도 커밋).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    category: { findUnique: vi.fn() },
    transaction: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock('@/lib/category-matcher', () => ({
  matchCategory: vi.fn(),
  suggestByHistory: vi.fn(),
  getAllCategories: vi.fn(),
}))
vi.mock('@/lib/ai/claude-advisor', () => ({ askAdvisor: vi.fn() }))
vi.mock('@/lib/whooing-webhook', () => ({ sendToWhooing: vi.fn() }))
// grammY 봇 모듈(notifyBot)을 끌어오지 않게 통째로 대체한다
vi.mock('@/bot/notifications/budget-alert', () => ({ checkBudgetUsage: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { matchCategory, suggestByHistory, getAllCategories } from '@/lib/category-matcher'
import { askAdvisor } from '@/lib/ai/claude-advisor'
import { sendToWhooing } from '@/lib/whooing-webhook'
import { checkBudgetUsage } from '@/bot/notifications/budget-alert'
import { registerExpenseCommands, registerExpenseFallback } from '../expense'
import { captureBot, fakeCtx, flush, replyButtons, rowsOf, type FakeCtxOptions } from './telegram-fake'

const cat = (id: string, name: string, icon: string | null = null) => ({ id, name, icon, type: 'expense' })
const FOOD = cat('c-food', '식비', '🍚')
const CAFE = cat('c-cafe', '카페', '☕')
const TAXI = cat('c-taxi', '교통', null)

const mocked = {
  categoryFind: vi.mocked(prisma.category.findUnique),
  txCreate: vi.mocked(prisma.transaction.create),
  $transaction: vi.mocked(prisma.$transaction),
  match: vi.mocked(matchCategory),
  history: vi.mocked(suggestByHistory),
  all: vi.mocked(getAllCategories),
  ask: vi.mocked(askAdvisor),
  whooing: vi.mocked(sendToWhooing),
  budget: vi.mocked(checkBudgetUsage),
}

const commands = captureBot(registerExpenseCommands)
const fallbacks = captureBot(registerExpenseFallback)
const incomeHears = commands.hears[0]
const callback = commands.on[0]
const fallback = fallbacks.on[0]

async function sendText(text: string, opts: FakeCtxOptions = {}) {
  const f = fakeCtx({ text, ...opts })
  const next = vi.fn(async () => undefined)
  await fallback.handler(f.ctx, next)
  return { ...f, next }
}

async function press(data: string, messageId: number, opts: FakeCtxOptions = {}) {
  const f = fakeCtx({ data, messageId, ...opts })
  const next = vi.fn(async () => undefined)
  await callback.handler(f.ctx, next)
  return { ...f, next }
}

/** 단일 매칭 소비 입력 → 확인 메시지 id 와 txId. */
async function startSingle(text = '점심 12000', opts: FakeCtxOptions = {}) {
  mocked.match.mockResolvedValueOnce([FOOD])
  const r = await sendText(text, opts)
  const data = replyButtons(r.calls)
  const txId = data[0].split(':')[2]
  return { messageId: r.sentIds[0], txId, data }
}

beforeEach(() => {
  for (const m of Object.values(mocked)) m.mockReset()
  mocked.budget.mockResolvedValue(undefined)
  mocked.whooing.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('등록 — 필터와 순서', () => {
  it('수입 hears 하나 · 콜백 on 하나 · fallback on 하나', () => {
    expect(commands.hears.map((x) => x.re.source)).toEqual(['^수입\\s+.+$'])
    expect(commands.on.map((x) => x.filter)).toEqual(['callback_query:data'])
    expect(fallbacks.on.map((x) => x.filter)).toEqual(['message:text'])
  })
})

describe('T1 자유 텍스트 거름 — 다음 핸들러로 넘기는 조건과 순서', () => {
  it.each([
    ['/start 3', '슬래시 명령'],
    ['현황', '명령 단어 단독'],
    ['매수 세진 AAPL 1 150', '명령 단어 + 공백'],
    ['예산설정 식비 300000', '명령 단어(긴 이름)'],
    ['소비', '소비 단독'],
    ['예산  ', '예산 단독(공백)'],
    ['점심 먹었다', '숫자 없음'],
    ['테슬라 2026 전망 알려줘', '질문형(숫자 포함)'],
    ['삼성 3000 어때?', '물음표'],
    ['소담 TIGER 10주 24900원에 샀어', '거래 문장'],
  ])('%s → next (%s) · 응답 0', async (text) => {
    const r = await sendText(text)
    expect(r.next).toHaveBeenCalledTimes(1)
    expect(r.calls).toEqual([])
    expect(mocked.match).not.toHaveBeenCalled()
    expect(mocked.ask).not.toHaveBeenCalled()
  })

  it('명령 단어가 다른 말에 붙어 있으면 거르지 않는다 — "매수수수료 3000" 은 소비', async () => {
    mocked.match.mockResolvedValueOnce([FOOD])
    const r = await sendText('매수수수료 3000')
    expect(r.next).not.toHaveBeenCalled()
    expect(mocked.match).toHaveBeenCalledWith('매수수수료', 'expense')
  })
})

describe('T2 금액 토큰 분기', () => {
  it('금액 토큰 2개 → 복수 파싱(AI) · 진행 안내', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }) // 끝나지 않는 AI — 실제 typing 타이머를 남기지 않는다
    mocked.ask.mockReturnValueOnce(new Promise(() => undefined))
    const r = await sendText('점심 12000 커피 4500')
    expect(r.calls).toEqual([['reply', '📝 여러 건 파싱 중...']])
    expect(mocked.ask).toHaveBeenCalledTimes(1)
    const [prompt, options] = mocked.ask.mock.calls[0]
    expect(prompt.endsWith('메시지: 점심 12000 커피 4500')).toBe(true)
    expect(options).toEqual({ timeout: 60_000, intent: 'parse', caller: 'bot:expense_parse' })
    expect(mocked.match).not.toHaveBeenCalled()
  })

  it('날짜·제품명 숫자는 금액 토큰이 아니다 — 단건 경로', async () => {
    mocked.match.mockResolvedValueOnce([FOOD])
    await sendText('3월 29일 점심 12000')
    expect(mocked.ask).not.toHaveBeenCalled()
    mocked.match.mockResolvedValueOnce([FOOD])
    await sendText('RTX4090 케이스 800')
    expect(mocked.ask).not.toHaveBeenCalled()
    expect(mocked.match).toHaveBeenLastCalledWith('RTX4090 케이스', 'expense')
  })
})

describe('T3 파서 오류', () => {
  it('금액이 모호하면 ⚠️ 안내만', async () => {
    const r = await sendText('점심 12 커피 45')
    expect(r.calls).toEqual([['reply', '⚠️ 금액이 모호합니다. 설명과 금액을 하나씩 입력해주세요.\n예: 점심 12000']])
    expect(mocked.match).not.toHaveBeenCalled()
  })
})

describe('T4 카테고리 경로 4 + 키보드 모양', () => {
  it('단일 매칭 → 확인 키보드(확인·변경 / 취소)', async () => {
    mocked.match.mockResolvedValueOnce([FOOD])
    const r = await sendText('점심 12000')
    expect(r.calls).toHaveLength(1)
    const [name, text, opts] = r.calls[0] as [string, string, { reply_markup: unknown }]
    expect(name).toBe('reply')
    expect(text).toBe('📝 소비 기록\n\n내용: 점심\n금액: ₩12,000\n카테고리: 🍚 식비\n\n기록하시겠습니까?')
    expect(Object.keys(opts)).toEqual(['reply_markup'])
    const tx = replyButtons(r.calls)[0].split(':')[2]
    expect(tx).toMatch(/^\d+_[a-z0-9]{1,6}$/)
    expect(rowsOf(opts.reply_markup)).toEqual([
      [['✅ 확인', `tx:confirm:${tx}`], ['🔄 카테고리 변경', `tx:change:${tx}`]],
      [['❌ 취소', `tx:cancel:${tx}`]],
    ])
    expect(mocked.history).not.toHaveBeenCalled()
  })

  it('다중 매칭(키워드) → 2열 그리드 + 취소 행 · 홀수 개', async () => {
    mocked.match.mockResolvedValueOnce([FOOD, CAFE, TAXI])
    const r = await sendText('점심 12000')
    const [, text, opts] = r.calls[0] as [string, string, { reply_markup: unknown }]
    expect(text).toBe('📝 소비 기록\n\n내용: 점심\n금액: ₩12,000\n\n여러 카테고리가 매칭됩니다. 선택해주세요:')
    const tx = replyButtons(r.calls)[0].split(':')[2]
    expect(rowsOf(opts.reply_markup)).toEqual([
      [['🍚 식비', `tx:cat:${tx}:c-food`], ['☕ 카페', `tx:cat:${tx}:c-cafe`]],
      [['교통', `tx:cat:${tx}:c-taxi`]],
      [['❌ 취소', `tx:cancel:${tx}`]],
    ])
  })

  it('미매칭 → 히스토리 추천 · 취소 옆 전체 카테고리 · 끝에 빈 행(현재 동작) · 짝수 개', async () => {
    mocked.match.mockResolvedValueOnce([])
    mocked.history.mockResolvedValueOnce([FOOD, CAFE])
    const r = await sendText('뭔가 5000')
    const [, text, opts] = r.calls[0] as [string, string, { reply_markup: unknown }]
    expect(text).toBe('📝 소비 기록\n\n내용: 뭔가\n금액: ₩5,000\n\n추천 카테고리에서 선택해주세요:')
    const tx = replyButtons(r.calls)[0].split(':')[2]
    expect(rowsOf(opts.reply_markup)).toEqual([
      [['🍚 식비', `tx:cat:${tx}:c-food`], ['☕ 카페', `tx:cat:${tx}:c-cafe`]],
      [['❌ 취소', `tx:cancel:${tx}`], ['📋 전체 카테고리', `tx:allcat:${tx}`]],
      [],
    ])
    expect(mocked.all).not.toHaveBeenCalled()
  })

  it('히스토리도 없으면 전체 목록', async () => {
    mocked.match.mockResolvedValueOnce([])
    mocked.history.mockResolvedValueOnce([])
    mocked.all.mockResolvedValueOnce([TAXI])
    const r = await sendText('수입 보너스 500000', {})
    // fallback 은 "수입 …" 을 거른다 — 이 경로는 수입 hears 가 받는다(T16). 여기서는 거름만 확인
    expect(r.next).toHaveBeenCalled()
    const s = await sendText('뭔가 5000')
    const [, text, opts] = s.calls[0] as [string, string, { reply_markup: unknown }]
    expect(text.endsWith('\n\n카테고리를 선택해주세요:')).toBe(true)
    expect(mocked.all).toHaveBeenCalledWith('expense')
    const tx = replyButtons(s.calls)[0].split(':')[2]
    expect(rowsOf(opts.reply_markup)).toEqual([[['교통', `tx:cat:${tx}:c-taxi`]], [['❌ 취소', `tx:cancel:${tx}`]]])
  })

  it('카테고리가 하나도 없으면 안내 · 키보드 없음', async () => {
    mocked.match.mockResolvedValueOnce([])
    mocked.history.mockResolvedValueOnce([])
    mocked.all.mockResolvedValueOnce([])
    const r = await sendText('뭔가 5000')
    expect(r.calls).toEqual([['reply', '⚠️ 소비 카테고리가 없습니다. 웹에서 카테고리를 추가해주세요.']])
  })

  it('처리 중 예외 → 소비 실패 안내', async () => {
    mocked.match.mockRejectedValueOnce(new Error('db'))
    const r = await sendText('점심 12000')
    expect(r.calls).toEqual([['reply', '⚠️ 소비 기록에 실패했습니다.']])
  })
})

describe('T5 tx: 콜백', () => {
  it('confirm → DB 기록(확정 시각 · userId 문자열) → 후잉 → 토스트 · 버튼 제거 · 본문 교체 → 예산 체크', async () => {
    const { messageId, txId } = await startSingle()
    mocked.categoryFind.mockResolvedValueOnce({ icon: '🍚', name: '식비' } as never)
    const createdAt = new Date('2026-10-29T03:00:00Z')
    mocked.txCreate.mockResolvedValueOnce({ amount: 12000, description: '점심', categoryId: 'c-food', transactedAt: createdAt } as never)
    const r = await press(`tx:confirm:${txId}`, messageId)
    const data = mocked.txCreate.mock.calls[0][0].data
    expect(data).toMatchObject({ amount: 12000, description: '점심', categoryId: 'c-food', userId: '7' })
    expect(data.transactedAt).toBeInstanceOf(Date)
    expect(mocked.whooing).toHaveBeenCalledWith({ amount: 12000, description: '점심', categoryId: 'c-food', transactedAt: createdAt })
    expect(r.calls).toEqual([
      ['answerCallbackQuery', { text: '기록 완료!' }],
      ['editMessageReplyMarkup', { reply_markup: undefined }],
      ['editMessageText', '✅ 소비 기록 완료\n\n내용: 점심\n금액: ₩12,000\n카테고리: 🍚 식비'],
    ])
    expect(mocked.budget).toHaveBeenCalledTimes(1)
    expect(r.next).not.toHaveBeenCalled()
  })

  it('중복 클릭 — 확정 뒤 같은 버튼은 만료(토스트 + 버튼 제거)', async () => {
    const { messageId, txId } = await startSingle()
    mocked.categoryFind.mockResolvedValueOnce({ icon: null, name: '식비' } as never)
    mocked.txCreate.mockResolvedValueOnce({ amount: 1, description: 'x', categoryId: 'c', transactedAt: new Date() } as never)
    await press(`tx:confirm:${txId}`, messageId)
    const r = await press(`tx:confirm:${txId}`, messageId)
    expect(r.calls).toEqual([
      ['answerCallbackQuery', { text: '⚠️ 만료된 요청입니다.' }],
      ['editMessageReplyMarkup', { reply_markup: undefined }],
    ])
    expect(mocked.txCreate).toHaveBeenCalledTimes(1)
  })

  it('cancel → 토스트 · 버튼 제거 · 본문 교체(두 호출 순서) · 다시 누르면 만료', async () => {
    const { messageId, txId } = await startSingle()
    const r = await press(`tx:cancel:${txId}`, messageId)
    expect(r.calls).toEqual([
      ['answerCallbackQuery', { text: '취소되었습니다.' }],
      ['editMessageReplyMarkup', { reply_markup: undefined }],
      ['editMessageText', '❌ 기록이 취소되었습니다.'],
    ])
    const again = await press(`tx:cancel:${txId}`, messageId)
    expect(again.calls[0]).toEqual(['answerCallbackQuery', { text: '⚠️ 만료된 요청입니다.' }])
  })

  it('본인이 아니면 거부 · 상태 유지(본인은 그 뒤 확정 가능)', async () => {
    const { messageId, txId } = await startSingle()
    const r = await press(`tx:cancel:${txId}`, messageId, { fromId: 8 })
    expect(r.calls).toEqual([['answerCallbackQuery', { text: '⚠️ 본인만 확인/취소할 수 있습니다.' }]])
    const own = await press(`tx:cancel:${txId}`, messageId)
    expect(own.calls[0]).toEqual(['answerCallbackQuery', { text: '취소되었습니다.' }])
  })

  it('T17 콜백에 from 이 없으면 거부', async () => {
    const { messageId, txId } = await startSingle()
    const r = await press(`tx:cancel:${txId}`, messageId, { fromId: undefined })
    expect(r.calls).toEqual([['answerCallbackQuery', { text: '⚠️ 본인만 확인/취소할 수 있습니다.' }]])
  })

  it('T17 요청에 from 이 없었으면(요청자 0) 아무도 확정할 수 없다', async () => {
    const { messageId, txId } = await startSingle('점심 12000', { fromId: undefined })
    const r = await press(`tx:cancel:${txId}`, messageId)
    expect(r.calls).toEqual([['answerCallbackQuery', { text: '⚠️ 본인만 확인/취소할 수 있습니다.' }]])
    const anon = await press(`tx:cancel:${txId}`, messageId, { fromId: undefined })
    expect(anon.calls).toEqual([['answerCallbackQuery', { text: '⚠️ 본인만 확인/취소할 수 있습니다.' }]])
  })

  it('다른 메시지·다른 chat 의 같은 txId 는 상태를 찾지 못한다', async () => {
    const { messageId, txId } = await startSingle()
    const r1 = await press(`tx:cancel:${txId}`, messageId + 1)
    expect(r1.calls[0]).toEqual(['answerCallbackQuery', { text: '⚠️ 만료된 요청입니다.' }])
    const r2 = await press(`tx:cancel:${txId}`, messageId, { chatId: 101 })
    expect(r2.calls[0]).toEqual(['answerCallbackQuery', { text: '⚠️ 만료된 요청입니다.' }])
  })

  it('시간 만료 — 5분 뒤 누르면 만료 안내 · 상태 삭제', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-29T00:00:00Z'))
    const { messageId, txId } = await startSingle()
    vi.setSystemTime(new Date('2026-10-29T00:05:01Z'))
    const r = await press(`tx:cancel:${txId}`, messageId)
    expect(r.calls).toEqual([
      ['answerCallbackQuery', { text: '⚠️ 요청이 만료되었습니다.' }],
      ['editMessageReplyMarkup', { reply_markup: undefined }],
    ])
    const again = await press(`tx:cancel:${txId}`, messageId)
    expect(again.calls[0]).toEqual(['answerCallbackQuery', { text: '⚠️ 만료된 요청입니다.' }])
  })

  it('메시지 없음·txId 없음 → 안내 토스트만', async () => {
    const r1 = await press('tx:confirm:abc', 1, { messageId: null })
    expect(r1.calls).toEqual([['answerCallbackQuery', { text: '⚠️ 메시지를 찾을 수 없습니다.' }]])
    const r2 = await press('tx:confirm', 1)
    expect(r2.calls).toEqual([['answerCallbackQuery', { text: '⚠️ 메시지를 찾을 수 없습니다.' }]])
  })

  it('change · allcat → 전체 목록 키보드로 본문·키보드 교체(한 호출)', async () => {
    for (const action of ['change', 'allcat']) {
      const { messageId, txId } = await startSingle()
      mocked.all.mockResolvedValueOnce([FOOD, CAFE])
      const r = await press(`tx:${action}:${txId}`, messageId)
      expect(mocked.all).toHaveBeenLastCalledWith('expense')
      expect(r.calls).toHaveLength(2)
      expect(r.calls[0]).toEqual(['answerCallbackQuery'])
      const [name, text, opts] = r.calls[1] as [string, string, { reply_markup: unknown }]
      expect(name).toBe('editMessageText')
      expect(text).toBe('📝 소비 기록\n\n내용: 점심\n금액: ₩12,000\n\n카테고리를 선택해주세요:')
      expect(Object.keys(opts)).toEqual(['reply_markup'])
      expect(rowsOf(opts.reply_markup)).toEqual([
        [['🍚 식비', `tx:cat:${txId}:c-food`], ['☕ 카페', `tx:cat:${txId}:c-cafe`]],
        [['❌ 취소', `tx:cancel:${txId}`]],
      ])
    }
  })

  it('change — 카테고리 0 이면 토스트만', async () => {
    const { messageId, txId } = await startSingle()
    mocked.all.mockResolvedValueOnce([])
    const r = await press(`tx:change:${txId}`, messageId)
    expect(r.calls).toEqual([['answerCallbackQuery', { text: '⚠️ 카테고리가 없습니다.' }]])
  })

  it('cat → 선택한 카테고리로 기록 · 미선택 pending 의 confirm 은 거부', async () => {
    mocked.match.mockResolvedValueOnce([FOOD, CAFE])
    const s = await sendText('점심 12000')
    const tx = replyButtons(s.calls)[0].split(':')[2]
    const messageId = s.sentIds[0]
    const c = await press(`tx:confirm:${tx}`, messageId)
    expect(c.calls).toEqual([['answerCallbackQuery', { text: '⚠️ 카테고리가 선택되지 않았습니다.' }]])

    mocked.categoryFind
      .mockResolvedValueOnce({ id: 'c-cafe', name: '카페', icon: '☕' } as never)
      .mockResolvedValueOnce({ icon: '☕', name: '카페' } as never)
    mocked.txCreate.mockResolvedValueOnce({ amount: 12000, description: '점심', categoryId: 'c-cafe', transactedAt: new Date() } as never)
    const r = await press(`tx:cat:${tx}:c-cafe`, messageId)
    expect(mocked.categoryFind.mock.calls[0][0]).toEqual({ where: { id: 'c-cafe' }, select: { id: true, name: true, icon: true } })
    expect(mocked.txCreate.mock.calls[0][0].data).toMatchObject({ categoryId: 'c-cafe', userId: '7' })
    expect(r.calls.map((x) => x[0])).toEqual(['answerCallbackQuery', 'editMessageReplyMarkup', 'editMessageText'])
    expect(r.calls[2]).toEqual(['editMessageText', '✅ 소비 기록 완료\n\n내용: 점심\n금액: ₩12,000\n카테고리: ☕ 카페'])
  })

  it('cat — 카테고리 id 없음 · 찾을 수 없음 → 토스트(상태는 이미 지워짐)', async () => {
    mocked.match.mockResolvedValueOnce([FOOD, CAFE])
    const s = await sendText('점심 12000')
    const tx = replyButtons(s.calls)[0].split(':')[2]
    const r1 = await press(`tx:cat:${tx}`, s.sentIds[0])
    expect(r1.calls).toEqual([['answerCallbackQuery', { text: '⚠️ 카테고리 정보가 없습니다.' }]])
    const r2 = await press(`tx:cat:${tx}:x`, s.sentIds[0])
    expect(r2.calls[0]).toEqual(['answerCallbackQuery', { text: '⚠️ 만료된 요청입니다.' }])

    mocked.match.mockResolvedValueOnce([FOOD, CAFE])
    const s2 = await sendText('점심 12000')
    const tx2 = replyButtons(s2.calls)[0].split(':')[2]
    mocked.categoryFind.mockResolvedValueOnce(null)
    const r3 = await press(`tx:cat:${tx2}:gone`, s2.sentIds[0])
    expect(r3.calls).toEqual([['answerCallbackQuery', { text: '⚠️ 카테고리를 찾을 수 없습니다.' }]])
  })

  it('기록 실패(DB) → 실패 토스트 · 버튼 제거 · 실패 본문', async () => {
    const { messageId, txId } = await startSingle()
    mocked.categoryFind.mockResolvedValueOnce(null)
    mocked.txCreate.mockRejectedValueOnce(new Error('db'))
    const r = await press(`tx:confirm:${txId}`, messageId)
    expect(r.calls).toEqual([
      ['answerCallbackQuery', { text: '⚠️ 기록에 실패했습니다.' }],
      ['editMessageReplyMarkup', { reply_markup: undefined }],
      ['editMessageText', '⚠️ 소비 기록에 실패했습니다. 잠시 후 다시 시도해주세요.'],
    ])
    expect(mocked.budget).not.toHaveBeenCalled()
  })

  it('현재 동작 — 기록 뒤 본문 교체가 실패하면 "실패" 를 이어 보낸다(DB 에는 기록됨 · UQ-3)', async () => {
    const { messageId, txId } = await startSingle()
    mocked.categoryFind.mockResolvedValueOnce(null)
    mocked.txCreate.mockResolvedValueOnce({ amount: 12000, description: '점심', categoryId: 'c-food', transactedAt: new Date() } as never)
    const f = fakeCtx({ data: `tx:confirm:${txId}`, messageId })
    f.ctx.editMessageText.mockImplementationOnce(async (...args: unknown[]) => {
      f.calls.push(['editMessageText', ...args])
      throw new Error('telegram 400')
    })
    await callback.handler(f.ctx, vi.fn())
    expect(f.calls).toEqual([
      ['answerCallbackQuery', { text: '기록 완료!' }],
      ['editMessageReplyMarkup', { reply_markup: undefined }],
      ['editMessageText', '✅ 소비 기록 완료\n\n내용: 점심\n금액: ₩12,000\n카테고리: 식비'],
      ['answerCallbackQuery', { text: '⚠️ 기록에 실패했습니다.' }],
      ['editMessageReplyMarkup', { reply_markup: undefined }],
      ['editMessageText', '⚠️ 소비 기록에 실패했습니다. 잠시 후 다시 시도해주세요.'],
    ])
    expect(mocked.txCreate).toHaveBeenCalledTimes(1)
  })

  it('후잉 실패는 기록·응답에 영향 없음', async () => {
    const { messageId, txId } = await startSingle()
    mocked.categoryFind.mockResolvedValueOnce(null)
    mocked.txCreate.mockResolvedValueOnce({ amount: 12000, description: '점심', categoryId: 'c-food', transactedAt: new Date() } as never)
    mocked.whooing.mockRejectedValueOnce(new Error('whooing'))
    const r = await press(`tx:confirm:${txId}`, messageId)
    expect(r.calls[0]).toEqual(['answerCallbackQuery', { text: '기록 완료!' }])
  })

  it('콜백 처리 중 던지면 오류 토스트', async () => {
    const { messageId, txId } = await startSingle()
    mocked.all.mockRejectedValueOnce(new Error('db'))
    const r = await press(`tx:change:${txId}`, messageId)
    expect(r.calls).toEqual([['answerCallbackQuery', { text: '⚠️ 처리 중 오류가 발생했습니다.' }]])
  })

  it('tx:·multi: 가 아니면 next', async () => {
    const r = await press('trade:confirm:1', 1)
    expect(r.next).toHaveBeenCalledTimes(1)
    expect(r.calls).toEqual([])
  })
})

describe('T15 복수 파싱(fire-and-forget) · T6 multi: 콜백', () => {
  async function startMulti(response: string, opts: FakeCtxOptions = {}) {
    mocked.ask.mockResolvedValueOnce({ response } as never)
    const r = await sendText('어제 점심 12000 커피 4500', opts)
    await flush()
    return r
  }

  it('AI 결과 → 카테고리 매칭(미매칭은 전체 첫 카테고리 · 없으면 미분류) → 확인 키보드', async () => {
    mocked.match.mockResolvedValueOnce([FOOD]).mockResolvedValueOnce([]).mockResolvedValueOnce([])
    mocked.all.mockResolvedValueOnce([CAFE]).mockResolvedValueOnce([])
    const r = await startMulti(
      '결과: [{"date":"2026-10-28","description":"점심","amount":12000,"type":"expense"},' +
        '{"date":"2026-10-28","description":"커피","amount":4500.4},' +
        '{"date":"2026-10-28","description":"용돈","amount":30000,"type":"income"}]',
    )
    expect(r.calls).toHaveLength(2)
    const [name, text, opts] = r.calls[1] as [string, string, { reply_markup: unknown }]
    expect(name).toBe('reply')
    expect(text).toBe(
      '📝 3건 거래 확인\n\n' +
        '2026-10-28 | 소비 | 점심 | ₩12,000 | 식비\n' +
        '2026-10-28 | 소비 | 커피 | ₩4,500 | 카페\n' +
        '2026-10-28 | 수입 | 용돈 | ₩30,000 | 미분류\n' +
        '\n기록하시겠습니까?',
    )
    const tx = replyButtons(r.calls, 1)[0].split(':')[2]
    expect(rowsOf(opts.reply_markup)).toEqual([[['✅ 전체 확인', `multi:confirm:${tx}`], ['❌ 취소', `multi:cancel:${tx}`]]])
    expect(mocked.all.mock.calls).toEqual([['expense'], ['income']])
  })

  it('typing — 5 s 마다 · AI 가 끝나면 멈춘다(.finally)', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    let resolve: (v: unknown) => void = () => undefined
    mocked.ask.mockReturnValueOnce(new Promise((r) => (resolve = r)) as never)
    const r = await sendText('점심 12000 커피 4500')
    expect(r.ctx.replyWithChatAction).not.toHaveBeenCalled()
    vi.advanceTimersByTime(5000)
    expect(r.ctx.replyWithChatAction).toHaveBeenCalledTimes(1)
    expect(r.ctx.replyWithChatAction).toHaveBeenCalledWith('typing')
    vi.advanceTimersByTime(4999)
    expect(r.ctx.replyWithChatAction).toHaveBeenCalledTimes(1)
    resolve({ response: '[]' })
    await flush()
    vi.advanceTimersByTime(20_000)
    expect(r.ctx.replyWithChatAction).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['형식 없음', '모르겠어요', '⚠️ 거래 정보를 파싱할 수 없습니다. 한 건씩 입력해주세요.'],
    ['오류 객체', '{"error":"날짜가 없음"}', '⚠️ 파싱 실패: 날짜가 없음'],
    ['빈 배열', '[]', '⚠️ 거래를 추출할 수 없습니다.'],
    ['깨진 JSON', '[{"a":]', '⚠️ 파싱 결과를 해석할 수 없습니다.'],
    ['유효 0', '[{"description":"","amount":1},{"description":"x","amount":0}]', '⚠️ 유효한 거래가 없습니다.'],
  ])('AI 결과 %s → 안내', async (_n, response, msg) => {
    const r = await startMulti(response)
    expect(r.calls).toEqual([['reply', '📝 여러 건 파싱 중...'], ['reply', msg]])
  })

  it('AI 실패 → 정적 안내(.catch 유지)', async () => {
    mocked.ask.mockRejectedValueOnce(new Error('timeout secret'))
    const r = await sendText('점심 12000 커피 4500')
    await flush()
    expect(r.calls).toEqual([
      ['reply', '📝 여러 건 파싱 중...'],
      ['reply', '⚠️ 여러 건 파싱에 실패했습니다. 한 건씩 입력해주세요.\n예: 점심 12000'],
    ])
  })

  async function multiReady(opts: FakeCtxOptions = {}) {
    mocked.match.mockResolvedValueOnce([FOOD]).mockResolvedValueOnce([])
    mocked.all.mockResolvedValueOnce([])
    const r = await startMulti(
      '[{"date":"2026-10-27","description":"점심","amount":12000},{"date":"2026-10-28","description":"기타","amount":100}]',
      opts,
    )
    const tx = replyButtons(r.calls, 1)[0].split(':')[2]
    return { tx, messageId: r.sentIds[1] }
  }

  it('confirm → 한 트랜잭션 · 확정 행 transactedAt = 파싱 날짜 · 미분류 제외 안내 · 예산 체크', async () => {
    const { tx, messageId } = await multiReady()
    mocked.txCreate.mockImplementation(((args: { data: unknown }) => args) as never)
    mocked.$transaction.mockResolvedValueOnce([
      { amount: 12000, description: '점심', categoryId: 'c-food', transactedAt: new Date('2026-10-27T00:00:00.000Z') },
    ] as never)
    const r = await press(`multi:confirm:${tx}`, messageId)
    expect(mocked.txCreate.mock.calls.map((c) => c[0])).toEqual([
      {
        data: {
          amount: 12000,
          description: '점심',
          categoryId: 'c-food',
          userId: '7',
          transactedAt: new Date('2026-10-27T00:00:00.000Z'),
        },
      },
    ])
    expect(mocked.whooing).toHaveBeenCalledTimes(1)
    expect(r.calls).toEqual([
      ['answerCallbackQuery', { text: '1건 기록 완료!' }],
      ['editMessageReplyMarkup', { reply_markup: undefined }],
      ['editMessageText', '✅ 1건 거래 기록 완료\n⚠️ 카테고리 미설정 1건 제외: 기타'],
    ])
    expect(mocked.budget).toHaveBeenCalledTimes(1)
    const again = await press(`multi:confirm:${tx}`, messageId)
    expect(again.calls[0]).toEqual(['answerCallbackQuery', { text: '⚠️ 만료된 요청입니다.' }])
  })

  it('confirm — 유효 0 이면 토스트 · 버튼 제거', async () => {
    mocked.match.mockResolvedValueOnce([])
    mocked.all.mockResolvedValueOnce([])
    const r0 = await startMulti('[{"date":"2026-10-28","description":"기타","amount":100},{"description":"x","amount":0}]')
    const tx = replyButtons(r0.calls, 1)[0].split(':')[2]
    const r = await press(`multi:confirm:${tx}`, r0.sentIds[1])
    expect(r.calls).toEqual([
      ['answerCallbackQuery', { text: '⚠️ 유효한 거래가 없습니다.' }],
      ['editMessageReplyMarkup', { reply_markup: undefined }],
    ])
  })

  it('cancel · 본인 아님(상태 되돌림) · from 없음 · DB 실패', async () => {
    const a = await multiReady()
    const other = await press(`multi:cancel:${a.tx}`, a.messageId, { fromId: 9 })
    expect(other.calls).toEqual([['answerCallbackQuery', { text: '⚠️ 본인만 확인/취소할 수 있습니다.' }]])
    const anon = await press(`multi:cancel:${a.tx}`, a.messageId, { fromId: undefined })
    expect(anon.calls).toEqual([['answerCallbackQuery', { text: '⚠️ 본인만 확인/취소할 수 있습니다.' }]])
    const own = await press(`multi:cancel:${a.tx}`, a.messageId)
    expect(own.calls).toEqual([
      ['answerCallbackQuery', { text: '취소되었습니다.' }],
      ['editMessageReplyMarkup', { reply_markup: undefined }],
      ['editMessageText', '❌ 기록이 취소되었습니다.'],
    ])

    const b = await multiReady()
    mocked.$transaction.mockRejectedValueOnce(new Error('db'))
    const fail = await press(`multi:confirm:${b.tx}`, b.messageId)
    expect(fail.calls).toEqual([
      ['answerCallbackQuery', { text: '⚠️ 기록에 실패했습니다.' }],
      ['editMessageReplyMarkup', { reply_markup: undefined }],
      ['editMessageText', '⚠️ 거래 기록에 실패했습니다.'],
    ])
  })

  it('T17 요청에 from 이 없었으면 아무도 확정할 수 없다', async () => {
    const a = await multiReady({ fromId: undefined })
    const own = await press(`multi:confirm:${a.tx}`, a.messageId)
    expect(own.calls).toEqual([['answerCallbackQuery', { text: '⚠️ 본인만 확인/취소할 수 있습니다.' }]])
    const anon = await press(`multi:confirm:${a.tx}`, a.messageId, { fromId: undefined })
    expect(anon.calls).toEqual([['answerCallbackQuery', { text: '⚠️ 본인만 확인/취소할 수 있습니다.' }]])
    expect(mocked.$transaction).not.toHaveBeenCalled()
  })

  it('시간 만료 → 만료 안내 · 버튼 제거', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-29T00:00:00Z'))
    const a = await multiReady()
    vi.setSystemTime(new Date('2026-10-29T00:06:00Z'))
    const r = await press(`multi:confirm:${a.tx}`, a.messageId)
    expect(r.calls).toEqual([
      ['answerCallbackQuery', { text: '⚠️ 요청이 만료되었습니다.' }],
      ['editMessageReplyMarkup', { reply_markup: undefined }],
    ])
  })

  it('메시지 없음 → 안내 토스트', async () => {
    const r = await press('multi:confirm:x', 1, { messageId: null })
    expect(r.calls).toEqual([['answerCallbackQuery', { text: '⚠️ 메시지를 찾을 수 없습니다.' }]])
  })
})

describe('T16 수입 … hears', () => {
  async function income(text: string) {
    const f = fakeCtx({ text })
    await incomeHears.handler(f.ctx, vi.fn())
    return f
  }

  it('정규식 — 인자 필수', () => {
    expect(incomeHears.re.test('수입 월급 5000000')).toBe(true)
    expect(incomeHears.re.test('수입')).toBe(false)
    expect(incomeHears.re.test('수입 ')).toBe(false)
  })

  it('단건 → 수입 확인 키보드', async () => {
    mocked.match.mockResolvedValueOnce([cat('c-pay', '급여', '💰')])
    const f = await income('수입 월급 5000000')
    expect(mocked.match).toHaveBeenCalledWith('월급', 'income')
    expect(f.calls[0][1]).toBe('📝 수입 기록\n\n내용: 월급\n금액: ₩5,000,000\n카테고리: 💰 급여\n\n기록하시겠습니까?')
  })

  it('금액 토큰 2개 → 복수 파싱', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    mocked.ask.mockReturnValueOnce(new Promise(() => undefined))
    const f = await income('수입 월급 5000000 보너스 300000')
    expect(f.calls).toEqual([['reply', '📝 여러 건 파싱 중...']])
  })

  it('처리 중 예외 → 수입 실패 안내', async () => {
    mocked.match.mockRejectedValueOnce(new Error('db'))
    const f = await income('수입 월급 5000000')
    expect(f.calls).toEqual([['reply', '⚠️ 수입 기록에 실패했습니다.']])
  })
})
