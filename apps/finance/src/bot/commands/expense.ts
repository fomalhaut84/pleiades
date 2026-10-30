import { Bot } from 'grammy'
import { prisma } from '@/lib/prisma'
import { parseExpenseInput, isParseError } from '@/lib/expense-parser'
import { matchCategory, suggestByHistory, getAllCategories, type MatchedCategory } from '@/lib/category-matcher'
import { askAdvisor } from '@/lib/ai/claude-advisor'
import { formatKRWFull } from '../utils/formatter'
import { isAiQuestion } from '../utils/ai-trigger'
import { isTradeMessage } from '../utils/trade-trigger'
import { checkBudgetUsage } from '../notifications/budget-alert'
import { sendToWhooing } from '@/lib/whooing-webhook'
import { KST_OFFSET_MS } from '@/lib/kst-date'
import {
  isSameRequester,
  plainReply,
  type ButtonOutput,
  type ButtonPress,
  type ReplyButton,
  type ReplyOutput,
  type Requester,
} from '../core/reply'
import { pendingKey } from '../core/state-key'
import {
  telegramButtonOutput,
  telegramButtonPress,
  telegramOutput,
  telegramRequester,
} from '../utils/telegram-reply'

// pleiades 009 D-3 PR-1a (pleiades#382 · 설계 §4 H2 · B · S): 판단(decide*)은 중립 응답 모델(`../core/reply`)로만 말한다.
// 텔레그램 등록부(register*)는 grammY ctx 를 어댑터(`../utils/telegram-reply`)로 감싸 넘긴다 — 호출열은 분리 전과 같다
// (특성 테스트 `__tests__/expense-telegram.test.ts`). Discord 수신은 PR-3.

/** `수입 …` 명시적 prefix — 인자 필수("수입" 단독은 budget 핸들러). grammY 와 chat(PR-3)이 같은 객체를 쓴다(설계 P). */
export const INCOME_RE = /^수입\s+.+$/

interface PendingTransaction {
  requestedByUserId: string
  /** `Transaction.userId` 에 쓸 값(Requester.dbUserId) */
  dbUserId: string
  description: string
  amount: number
  type: 'expense' | 'income'
  categoryId: string
  categoryName: string
  expiresAt: number
}

// pendingKey(메시지 키, txId) → 대기 중인 거래 정보
const pendingTransactions = new Map<string, PendingTransaction>()

// 5분 후 자동 만료
const PENDING_TTL_MS = 5 * 60 * 1000

function cleanExpired(): void {
  const now = Date.now()
  pendingTransactions.forEach((pending, key) => {
    if (pending.expiresAt < now) {
      pendingTransactions.delete(key)
    }
  })
}

/**
 * 카테고리 선택 버튼 행.
 * 2열 그리드 + 마지막 행 `취소`(지금 텔레그램 키보드 모양 그대로 — 행 재배치는 Discord 어댑터 몫 · 설계 B).
 */
function buildCategoryRows(categories: MatchedCategory[], txId: string): ReplyButton[][] {
  const rows: ReplyButton[][] = []
  for (let i = 0; i < categories.length; i += 2) {
    rows.push(
      categories.slice(i, i + 2).map((cat) => ({
        label: cat.icon ? `${cat.icon} ${cat.name}` : cat.name,
        action: `tx:cat:${txId}:${cat.id}`,
      })),
    )
  }
  rows.push([{ label: '❌ 취소', action: `tx:cancel:${txId}` }])
  return rows
}

// 복수 건 감지: 금액 토큰(숫자+단위 or 3자리 이상 독립 숫자)이 2개 이상이면 AI 복수 파싱
// 날짜(N월/N일) 및 제품명 내 숫자(RTX4090)는 제외
const AMOUNT_TOKEN_RE = /(?<=^|[\s,])\d[\d,]*(만\s*원|원|만)(?=$|[\s,.])|(?<=^|[\s,])\d{3,}(?=$|[\s,.])/g

// 소비 fallback 이 거르는 명령 단어 — 커맨드 단어 뒤에 공백 또는 문자열 끝이어야 매칭 (예: "매수수수료"는 통과)
// "수입 ..."은 expense 핸들러가 처리, "소비"/"수입" 단독은 budget 핸들러가 처리
const COMMAND_WORD_RE = /^(현황|계좌|주가|환율|매수|매도|수입|예산설정|알림설정|전략|전략목록|관심|관심삭제|관심목록|분석|브리핑|순자산|자산목록|자산추가|자산수정|리포트|백테스트)(\s|$)/i
const BUDGET_ALONE_RE = /^(소비|예산)\s*$/i

/**
 * 자유 텍스트가 소비 입력인지 — 아니면 다음 fallback(AI 거래 · AI 질문)으로 넘긴다.
 * `isCommand` 는 어댑터가 정한다(텔레그램 `/` 시작 · Discord `!` 시작 — 설계 P).
 */
export function expenseFallbackRoute(text: string, isCommand: boolean): 'expense' | 'next' {
  // 명령은 무시 → 다음 핸들러로
  if (isCommand) return 'next'
  // 기존 커맨드 패턴은 무시 (이미 다른 핸들러에서 처리됨)
  if (COMMAND_WORD_RE.test(text)) return 'next'
  if (BUDGET_ALONE_RE.test(text)) return 'next'

  // 숫자 미포함 → 다음 핸들러(AI fallback)로 전달
  if (!/\d/.test(text)) return 'next'

  // 숫자 포함이지만 질문형 키워드가 있으면 AI fallback으로 전달
  // (예: "테슬라 2026 전망 알려줘")
  if (isAiQuestion(text)) return 'next'

  // 숫자 포함이지만 거래 키워드가 있으면 AI 거래 파싱으로 전달
  // (예: "소담 TIGER S&P500 10주 24900원에 샀어")
  if (isTradeMessage(text)) return 'next'

  return 'expense'
}

/**
 * 자연어 소비/수입 입력 처리.
 * 기존 커맨드(주가, 환율, 매수, 매도, 현황, 계좌)에 매칭되지 않는 텍스트를 처리.
 */
export async function decideExpenseInput(text: string, out: ReplyOutput, who: Requester): Promise<void> {
  const amountCount = (text.match(AMOUNT_TOKEN_RE) ?? []).length
  if (amountCount >= 2) {
    fireMultiExpenseParse(out, who, text)
    return
  }

  const result = parseExpenseInput(text)
  if (isParseError(result)) {
    await out.reply(plainReply(`⚠️ ${result.error}`))
    return
  }

  const { description, amount, type } = result
  const typeLabel = type === 'expense' ? '소비' : '수입'

  // 카테고리 매칭
  const matched = await matchCategory(description, type)

  const txId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  if (matched.length === 1) {
    // 단일 매칭 → 확인 키보드
    const cat = matched[0]
    const catLabel = cat.icon ? `${cat.icon} ${cat.name}` : cat.name

    cleanExpired()
    const pending: PendingTransaction = {
      requestedByUserId: who.userId,
      dbUserId: who.dbUserId,
      description,
      amount,
      type,
      categoryId: cat.id,
      categoryName: cat.name,
      expiresAt: Date.now() + PENDING_TTL_MS,
    }

    const messageKey = await out.reply(
      plainReply(
        `📝 ${typeLabel} 기록\n\n` +
          `내용: ${description}\n` +
          `금액: ${formatKRWFull(amount)}\n` +
          `카테고리: ${catLabel}\n\n` +
          `기록하시겠습니까?`,
        [
          [
            { label: '✅ 확인', action: `tx:confirm:${txId}` },
            { label: '🔄 카테고리 변경', action: `tx:change:${txId}` },
          ],
          [{ label: '❌ 취소', action: `tx:cancel:${txId}` }],
        ],
      ),
    )

    pendingTransactions.set(pendingKey(messageKey, txId), pending)
    return
  }

  // 다중 매칭 → 그대로, 미매칭 → 히스토리 추천 → 없으면 전체 목록
  let categories: MatchedCategory[]
  let suggestionSource: 'keyword' | 'history' | 'all' = 'all'
  if (matched.length > 1) {
    categories = matched
    suggestionSource = 'keyword'
  } else {
    const historySuggestions = await suggestByHistory(description, type)
    if (historySuggestions.length > 0) {
      categories = historySuggestions
      suggestionSource = 'history'
    } else {
      categories = await getAllCategories(type)
    }
  }

  if (categories.length === 0) {
    await out.reply(plainReply(`⚠️ ${typeLabel} 카테고리가 없습니다. 웹에서 카테고리를 추가해주세요.`))
    return
  }

  cleanExpired()
  // categoryId는 아직 미확정 — 선택 후 설정
  const basePending: PendingTransaction = {
    requestedByUserId: who.userId,
    dbUserId: who.dbUserId,
    description,
    amount,
    type,
    categoryId: '',
    categoryName: '',
    expiresAt: Date.now() + PENDING_TTL_MS,
  }

  const prompt =
    suggestionSource === 'keyword'
      ? `여러 카테고리가 매칭됩니다. 선택해주세요:`
      : suggestionSource === 'history'
        ? `추천 카테고리에서 선택해주세요:`
        : `카테고리를 선택해주세요:`

  const rows = buildCategoryRows(categories, txId)
  if (suggestionSource === 'history') {
    // 취소 옆에 "전체 카테고리" · 끝의 빈 행은 지금 텔레그램 키보드 모양(InlineKeyboard `.row()`) 그대로
    rows[rows.length - 1].push({ label: '📋 전체 카테고리', action: `tx:allcat:${txId}` })
    rows.push([])
  }
  const messageKey = await out.reply(
    plainReply(
      `📝 ${typeLabel} 기록\n\n` +
        `내용: ${description}\n` +
        `금액: ${formatKRWFull(amount)}\n\n` +
        prompt,
      rows,
    ),
  )

  pendingTransactions.set(pendingKey(messageKey, txId), basePending)
}

/**
 * 버튼 처리.
 * tx:confirm:{txId} — 확인
 * tx:cancel:{txId} — 취소
 * tx:cat:{txId}:{categoryId} — 카테고리 선택
 * tx:change:{txId} — 카테고리 변경
 * tx:allcat:{txId} — 전체 카테고리 보기
 */
export async function decideExpenseButton(data: string, press: ButtonPress, out: ButtonOutput): Promise<void> {
  if (!data.startsWith('tx:')) return

  const parts = data.split(':')
  const action = parts[1]
  const txId = parts[2]
  if (!press.messageKey || !txId) {
    await out.toast('⚠️ 메시지를 찾을 수 없습니다.')
    return
  }

  const key = pendingKey(press.messageKey, txId)

  const pending = pendingTransactions.get(key)
  if (!pending) {
    await out.toast('⚠️ 만료된 요청입니다.')
    await out.removeButtons()
    return
  }

  // 요청자 검증 (모든 액션 공통)
  if (!isSameRequester(press.clickerId, pending.requestedByUserId)) {
    await out.toast('⚠️ 본인만 확인/취소할 수 있습니다.')
    return
  }

  if (pending.expiresAt < Date.now()) {
    pendingTransactions.delete(key)
    await out.toast('⚠️ 요청이 만료되었습니다.')
    await out.removeButtons()
    return
  }

  if (action === 'cancel') {
    pendingTransactions.delete(key)
    await out.toast('취소되었습니다.')
    await out.removeButtons()
    await out.edit(plainReply('❌ 기록이 취소되었습니다.'))
    return
  }

  if (action === 'cat') {
    // 카테고리 선택 — 중복 클릭 방지를 위해 먼저 Map에서 제거
    pendingTransactions.delete(key)

    const categoryId = parts[3]
    if (!categoryId) {
      await out.toast('⚠️ 카테고리 정보가 없습니다.')
      return
    }

    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true, name: true, icon: true },
    })

    if (!category) {
      await out.toast('⚠️ 카테고리를 찾을 수 없습니다.')
      return
    }

    await createTransaction(out, { ...pending, categoryId: category.id, categoryName: category.name })
    return
  }

  if (action === 'allcat' || action === 'change') {
    // allcat: 전체 카테고리 목록 표시 (히스토리 추천에서 "전체 보기" 클릭)
    // change: 카테고리 변경 → 전체 카테고리 목록 표시
    const categories = await getAllCategories(pending.type)
    if (categories.length === 0) {
      await out.toast('⚠️ 카테고리가 없습니다.')
      return
    }

    const typeLabel = pending.type === 'expense' ? '소비' : '수입'
    await out.toast()
    await out.edit(
      plainReply(
        `📝 ${typeLabel} 기록\n\n` +
          `내용: ${pending.description}\n` +
          `금액: ${formatKRWFull(pending.amount)}\n\n` +
          `카테고리를 선택해주세요:`,
        buildCategoryRows(categories, txId),
      ),
    )
    return
  }

  if (action === 'confirm') {
    if (!pending.categoryId) {
      await out.toast('⚠️ 카테고리가 선택되지 않았습니다.')
      return
    }

    pendingTransactions.delete(key)
    await createTransaction(out, pending)
    return
  }
}

async function createTransaction(
  out: ButtonOutput,
  pending: PendingTransaction
): Promise<void> {
  const typeLabel = pending.type === 'expense' ? '소비' : '수입'

  // pleiades 009 D-3 PR-2c (pleiades#396 · UQ-3): "실패" 안내는 기록 전 단계에만 — 기록 뒤 원본 수정 실패는
  // 예전에 여기로 와 기록된 거래에 "기록에 실패했습니다" 를 띄웠다. 이제 기록 뒤 단계는 아래에서 따로 잡는다.
  let category: { icon: string | null; name: string } | null
  let created: { amount: number; description: string; categoryId: string; transactedAt: Date }
  try {
    category = await prisma.category.findUnique({
      where: { id: pending.categoryId },
      select: { icon: true, name: true },
    })

    created = await prisma.transaction.create({
      data: {
        amount: pending.amount,
        description: pending.description,
        categoryId: pending.categoryId,
        userId: pending.dbUserId,
        transactedAt: new Date(),
      },
    })
  } catch (error) {
    console.error('[bot/expense] 거래 기록 실패:', error)
    await out.toast('⚠️ 기록에 실패했습니다.')
    await out.removeButtons()
    await out.edit(plainReply(`⚠️ ${typeLabel} 기록에 실패했습니다. 잠시 후 다시 시도해주세요.`))
    return
  }

  // 후잉 웹훅 전송 (별도 try-catch, 실패해도 거래 기록·텔레그램 응답에 영향 없음)
  try {
    await sendToWhooing({
      amount: created.amount,
      description: created.description,
      categoryId: created.categoryId,
      transactedAt: created.transactedAt,
    })
  } catch (error) {
    console.error('[bot/expense] 후잉 전송 실패:', error)
  }

  const catLabel = category?.icon
    ? `${category.icon} ${category.name}`
    : pending.categoryName

  // 기록은 끝났다 — 화면 갱신 실패는 로그만(거짓 "실패" 를 띄우지 않는다)
  try {
    await out.toast('기록 완료!')
    await out.removeButtons()
    await out.edit(
      plainReply(
        `✅ ${typeLabel} 기록 완료\n\n` +
          `내용: ${pending.description}\n` +
          `금액: ${formatKRWFull(pending.amount)}\n` +
          `카테고리: ${catLabel}`,
      ),
    )
  } catch (error) {
    console.error('[bot/expense] 기록 뒤 원본 수정 실패(기록은 됨):', error)
  }

  // 소비 기록 후 예산 사용률 체크 (비동기, 실패해도 무시)
  if (pending.type === 'expense') {
    checkBudgetUsage().catch((error) =>
      console.error('[bot/expense] 예산 경고 체크 실패:', error)
    )
  }
}

// ============================================================
// 복수 거래 AI 파싱
// ============================================================

interface ParsedMultiExpense {
  date: string
  description: string
  amount: number
  type: 'expense' | 'income'
}

interface PendingMultiExpense {
  requestedByUserId: string
  /** `Transaction.userId` 에 쓸 값(Requester.dbUserId) */
  dbUserId: string
  items: { parsed: ParsedMultiExpense; categoryId: string; categoryName: string }[]
  expiresAt: number
}

const pendingMultiExpenses = new Map<string, PendingMultiExpense>()

function cleanExpiredMulti(): void {
  const now = Date.now()
  pendingMultiExpenses.forEach((v, k) => {
    if (v.expiresAt < now) pendingMultiExpenses.delete(k)
  })
}

function buildMultiParsePrompt(): string {
  const kst = new Date(Date.now() + KST_OFFSET_MS)
  const today = kst.toISOString().slice(0, 10)
  return `다음 메시지에서 여러 건의 소비/수입 거래를 추출하세요.
오늘 날짜: ${today}
반드시 JSON 배열로만 응답하세요. 설명 없이 JSON만 출력하세요.

형식:
[{"date":"YYYY-MM-DD","description":"내용","amount":금액,"type":"expense또는income"}]

규칙:
- "오늘" → 오늘 날짜, "어제" → 어제 날짜, "그저께" → 그저께 날짜
- "3월 29일" → 올해 3월 29일
- 날짜 미지정 → 오늘 날짜
- 금액: 만원→10000, 20만원→200000 등 정수 변환
- type: 기본 "expense", "수입" 키워드 있으면 "income"
- 파싱 불가능하면 {"error":"이유"} 반환

메시지: `
}

/** fire-and-forget — 진행 안내 뒤 곧 돌아간다. 오류는 이 작업이 스스로 정적 안내로 받는다(설계 Q · T18). */
function fireMultiExpenseParse(out: ReplyOutput, who: Requester, text: string): void {
  out.reply(plainReply('📝 여러 건 파싱 중...'))
    .catch((e) => console.error('[bot] 복수 파싱 중 응답 실패:', e))

  const typingInterval = setInterval(() => {
    out.typing().catch(() => {})
  }, out.typingIntervalMs)

  askAdvisor(buildMultiParsePrompt() + text, { timeout: 60_000, intent: 'parse', caller: 'bot:expense_parse' })  // 구조 JSON 파싱 → haiku (35-A)
    .then(async (result) => {
      await handleMultiExpenseParsed(out, who, result.response)
    })
    .catch(async (error) => {
      console.error('[bot] 복수 거래 파싱 실패:', error)
      await out.reply(plainReply('⚠️ 여러 건 파싱에 실패했습니다. 한 건씩 입력해주세요.\n예: 점심 12000'))
    })
    .finally(() => clearInterval(typingInterval))
}

async function handleMultiExpenseParsed(out: ReplyOutput, who: Requester, response: string): Promise<void> {
  const jsonMatch = response.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    // 단일 에러 객체 체크
    const errMatch = response.match(/\{[^}]*"error"[^}]*\}/)
    if (errMatch) {
      try {
        const err = JSON.parse(errMatch[0])
        await out.reply(plainReply(`⚠️ 파싱 실패: ${err.error}`))
        return
      } catch { /* fall through */ }
    }
    await out.reply(plainReply('⚠️ 거래 정보를 파싱할 수 없습니다. 한 건씩 입력해주세요.'))
    return
  }

  let items: ParsedMultiExpense[]
  try {
    const raw = JSON.parse(jsonMatch[0])
    if (!Array.isArray(raw) || raw.length === 0) {
      await out.reply(plainReply('⚠️ 거래를 추출할 수 없습니다.'))
      return
    }
    items = raw.map((r: Record<string, unknown>) => ({
      date: String(r.date ?? new Date().toISOString().slice(0, 10)),
      description: String(r.description ?? ''),
      amount: Math.round(Number(r.amount)),
      type: r.type === 'income' ? 'income' as const : 'expense' as const,
    }))
  } catch {
    await out.reply(plainReply('⚠️ 파싱 결과를 해석할 수 없습니다.'))
    return
  }

  // 검증
  const valid = items.filter((i) => i.description && i.amount > 0)
  if (valid.length === 0) {
    await out.reply(plainReply('⚠️ 유효한 거래가 없습니다.'))
    return
  }

  // 카테고리 자동 매칭
  const matched: PendingMultiExpense['items'] = []
  for (const item of valid) {
    const cats = await matchCategory(item.description, item.type)
    const cat = cats.length > 0 ? cats[0] : null
    if (!cat) {
      const allCats = await getAllCategories(item.type)
      const fallback = allCats.length > 0 ? allCats[0] : null
      matched.push({
        parsed: item,
        categoryId: fallback?.id ?? '',
        categoryName: fallback?.name ?? '미분류',
      })
    } else {
      matched.push({
        parsed: item,
        categoryId: cat.id,
        categoryName: cat.name,
      })
    }
  }

  // 확인 메시지
  cleanExpiredMulti()
  const txId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const lines = [`📝 ${matched.length}건 거래 확인\n`]
  for (const m of matched) {
    const typeLabel = m.parsed.type === 'expense' ? '소비' : '수입'
    lines.push(`${m.parsed.date} | ${typeLabel} | ${m.parsed.description} | ${formatKRWFull(m.parsed.amount)} | ${m.categoryName}`)
  }
  lines.push('\n기록하시겠습니까?')

  const messageKey = await out.reply(
    plainReply(lines.join('\n'), [
      [
        { label: '✅ 전체 확인', action: `multi:confirm:${txId}` },
        { label: '❌ 취소', action: `multi:cancel:${txId}` },
      ],
    ]),
  )

  pendingMultiExpenses.set(pendingKey(messageKey, txId), {
    requestedByUserId: who.userId,
    dbUserId: who.dbUserId,
    items: matched,
    expiresAt: Date.now() + PENDING_TTL_MS,
  })
}

export async function decideMultiExpenseButton(data: string, press: ButtonPress, out: ButtonOutput): Promise<void> {
  if (!data.startsWith('multi:')) return

  const parts = data.split(':')
  const action = parts[1]
  const txId = parts[2]
  if (!press.messageKey || !txId) {
    await out.toast('⚠️ 메시지를 찾을 수 없습니다.')
    return
  }

  const key = pendingKey(press.messageKey, txId)
  const pending = pendingMultiExpenses.get(key)
  if (pending) pendingMultiExpenses.delete(key)

  if (!pending) {
    await out.toast('⚠️ 만료된 요청입니다.')
    await out.removeButtons()
    return
  }

  if (!isSameRequester(press.clickerId, pending.requestedByUserId)) {
    pendingMultiExpenses.set(key, pending)
    await out.toast('⚠️ 본인만 확인/취소할 수 있습니다.')
    return
  }

  if (pending.expiresAt < Date.now()) {
    await out.toast('⚠️ 요청이 만료되었습니다.')
    await out.removeButtons()
    return
  }

  if (action === 'cancel') {
    await out.toast('취소되었습니다.')
    await out.removeButtons()
    await out.edit(plainReply('❌ 기록이 취소되었습니다.'))
    return
  }

  if (action === 'confirm') {
    // pleiades 009 D-3 PR-2c (pleiades#396 · UQ-3): "실패" 안내는 기록 전 단계에만 — 기록 뒤 원본 수정 실패는 로그만
    const skipped = pending.items.filter((m) => !m.categoryId)
    const validItems = pending.items.filter((m) => m.categoryId)
    let created: { amount: number; description: string; categoryId: string; transactedAt: Date }[]
    try {
      if (validItems.length === 0) {
        await out.toast('⚠️ 유효한 거래가 없습니다.')
        await out.removeButtons()
        return
      }

      created = await prisma.$transaction(
        validItems.map((m) =>
          prisma.transaction.create({
            data: {
              amount: m.parsed.amount,
              description: m.parsed.description,
              categoryId: m.categoryId,
              userId: pending.dbUserId,
              transactedAt: new Date(`${m.parsed.date}T00:00:00.000Z`),
            },
          })
        )
      )
    } catch (error) {
      console.error('[bot/multi-expense] 거래 기록 실패:', error)
      await out.toast('⚠️ 기록에 실패했습니다.')
      await out.removeButtons()
      await out.edit(plainReply('⚠️ 거래 기록에 실패했습니다.'))
      return
    }

    // 후잉 전송 (트랜잭션 외부, 실패해도 거래 기록에 영향 없음)
    for (const tx of created) {
      try {
        await sendToWhooing({
          amount: tx.amount,
          description: tx.description,
          categoryId: tx.categoryId,
          transactedAt: tx.transactedAt,
        })
      } catch (err) {
        console.error('[bot/multi-expense] 후잉 전송 실패:', err)
      }
    }

    const skippedMsg = skipped.length > 0
      ? `\n⚠️ 카테고리 미설정 ${skipped.length}건 제외: ${skipped.map((s) => s.parsed.description).join(', ')}`
      : ''
    // 기록은 끝났다 — 화면 갱신 실패는 로그만(거짓 "실패" 를 띄우지 않는다)
    try {
      await out.toast(`${created.length}건 기록 완료!`)
      await out.removeButtons()
      await out.edit(plainReply(`✅ ${created.length}건 거래 기록 완료${skippedMsg}`))
    } catch (error) {
      console.error('[bot/multi-expense] 기록 뒤 원본 수정 실패(기록은 됨):', error)
    }

    const hasExpense = validItems.some((m) => m.parsed.type === 'expense')
    if (hasExpense) {
      checkBudgetUsage().catch((error) =>
        console.error('[bot/multi-expense] 예산 경고 체크 실패:', error)
      )
    }
  }
}

// ============================================================
// 텔레그램 등록부 — grammY ctx → 어댑터 → decide*
// ============================================================

export function registerExpenseCommands(bot: Bot): void {
  // "수입 ..." 명시적 prefix (인자 필수 — "수입" 단독은 budget 핸들러가 처리)
  bot.hears(INCOME_RE, async (ctx) => {
    try {
      await decideExpenseInput(ctx.message?.text ?? '', telegramOutput(ctx), telegramRequester(ctx))
    } catch (error) {
      console.error('[bot] 수입 입력 실패:', error)
      await ctx.reply('⚠️ 수입 기록에 실패했습니다.')
    }
  })

  // InlineKeyboard 콜백 (tx: + multi: prefix)
  bot.on('callback_query:data', async (ctx, next) => {
    const data = ctx.callbackQuery?.data
    if (data?.startsWith('tx:')) {
      try {
        await decideExpenseButton(data, telegramButtonPress(ctx), telegramButtonOutput(ctx))
      } catch (error) {
        console.error('[bot] 콜백 처리 실패:', error)
        await ctx.answerCallbackQuery({ text: '⚠️ 처리 중 오류가 발생했습니다.' })
      }
    } else if (data?.startsWith('multi:')) {
      try {
        await decideMultiExpenseButton(data, telegramButtonPress(ctx), telegramButtonOutput(ctx))
      } catch (error) {
        console.error('[bot] 복수 거래 콜백 실패:', error)
        await ctx.answerCallbackQuery({ text: '⚠️ 처리 중 오류가 발생했습니다.' })
      }
    } else {
      await next()
    }
  })
}

/**
 * 다른 커맨드에 매칭되지 않은 텍스트를 자연어 소비 입력으로 처리.
 * 반드시 다른 모든 hears 핸들러 이후에 등록해야 한다.
 */
export function registerExpenseFallback(bot: Bot): void {
  bot.on('message:text', async (ctx, next) => {
    const text = ctx.message.text
    // 텔레그램 명령 = 슬래시 시작
    if (expenseFallbackRoute(text, text.startsWith('/')) === 'next') return next()

    try {
      await decideExpenseInput(text, telegramOutput(ctx), telegramRequester(ctx))
    } catch (error) {
      console.error('[bot] 소비 입력 실패:', error)
      await ctx.reply('⚠️ 소비 기록에 실패했습니다.')
    }
  })
}
