import type { Bot, Context } from 'grammy'
import { prisma } from '@/lib/prisma'
import { parseStrategyText } from '@/lib/custom-strategy/parser'
import { conditionToString, type Condition } from '@/lib/custom-strategy/types'
import { escapeHtml, h } from '../utils/telegram'
import { plainReply, type ReplyOutput } from '../core/reply'
import { telegramOutput } from '../utils/telegram-reply'

/*
 * pleiades 009 D-3 PR-2b (pleiades#394 · 설계 `_workspace/009/d3/02_writer_d3_r3.md` §4 A2 · H2): 커스텀전략 등록 · 목록 · 삭제.
 * 판단(decide*)은 인자와 중립 응답 모델만 안다 · 텔레그램 원문 벗기기는 `*ArgsFromText`(지금 식 그대로).
 * 특성 테스트 `__tests__/special-telegram.test.ts` 가 텔레그램 호출열을 고정한다.
 */

export const CUSTOM_STRATEGY_REGISTER_RE = /^커스텀전략등록(?:\s+.*)?$/
export const CUSTOM_STRATEGY_LIST_RE = /^커스텀전략목록\s*$/
export const CUSTOM_STRATEGY_DELETE_RE = /^커스텀전략삭제(?:\s+.*)?$/

/** 텔레그램 원문 → 인자 — `/customstrategy` · `커스텀전략등록` 을 벗기고 trim(대소문자 무시 · `@bot` 은 벗기지 않는다 — 현재 동작). */
export function customStrategyRegisterArgsFromText(text: string): string {
  return text.replace(/^(\/customstrategy|커스텀전략등록)\s*/i, '').trim()
}

/** 텔레그램 원문 → 인자 — `/customstrategydelete` · `커스텀전략삭제` 를 벗기고 trim(대소문자 무시). */
export function customStrategyDeleteArgsFromText(text: string): string {
  return text.replace(/^(\/customstrategydelete|커스텀전략삭제)\s*/i, '').trim()
}

const MAX_STRATEGIES = 50

function formatStrategyBlock(s: {
  id: string
  name: string
  ticker: string
  conditions: unknown
  logic: string
  frequency: string
  isActive: boolean
  lastTriggeredAt: Date | null
}): string {
  const conds = Array.isArray(s.conditions)
    ? (s.conditions as Condition[]).map(conditionToString).join(` ${s.logic} `)
    : '(파싱 오류)'
  const status = s.isActive ? '🟢' : '⚫'
  const last = s.lastTriggeredAt ? `\n   최근 발동 ${s.lastTriggeredAt.toISOString().slice(0, 10)}` : ''
  return `${status} <b>[${escapeHtml(s.id.slice(-6))}]</b> ${escapeHtml(s.name)} (${escapeHtml(s.ticker)})\n   조건: ${escapeHtml(conds)}\n   빈도: ${escapeHtml(s.frequency)}${last}`
}

/**
 * /커스텀전략등록 <자연어>
 * 예: 커스텀전략등록 SOXL이 40달러 이하 + RSI 30 이하 시 매수 알림
 */
export async function decideCustomStrategyRegister(body: string, out: ReplyOutput): Promise<void> {

  if (!body) {
    await out.reply(plainReply(
      '⚙️ 커스텀 전략 등록\n\n' +
      '사용법: 커스텀전략등록 <자연어 전략>\n\n' +
      '예시:\n' +
      '- 커스텀전략등록 SOXL 40달러 이하 + RSI 30 이하 시 매수 알림\n' +
      '- 커스텀전략등록 NVDA MACD 골든크로스 시 알림\n' +
      '- 커스텀전략등록 TSLA 볼린저밴드 하단 이탈 시 알림\n\n' +
      '지원 조건: 현재가, RSI, MACD 크로스, SMA 크로스, 볼밴 위치, 기간별 변동률'
    ))
    return
  }

  const activeCount = await prisma.customStrategy.count({ where: { isActive: true } })
  if (activeCount >= MAX_STRATEGIES) {
    await out.reply(plainReply(`⚠️ 활성 전략은 최대 ${MAX_STRATEGIES}개까지만 등록 가능합니다. 기존 전략을 삭제한 후 다시 시도해주세요.`))
    return
  }

  await out.reply(plainReply('🤖 전략 파싱 중... (최대 60초)'))

  let parsed
  try {
    parsed = await parseStrategyText(body)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    await out.reply(plainReply(`⚠️ 전략 파싱 실패\n\n${msg}\n\n표현을 바꿔서 다시 시도해주세요.`))
    return
  }

  const created = await prisma.customStrategy.create({
    data: {
      name: parsed.name.trim(),
      description: body,
      ticker: parsed.ticker,
      conditions: parsed.conditions as unknown as Parameters<typeof prisma.customStrategy.create>[0]['data']['conditions'],
      logic: parsed.logic,
      frequency: parsed.frequency,
    },
  })

  const condSummary = parsed.conditions.map(conditionToString).join(` ${parsed.logic} `)
  await out.replyLong(
    [
      `✅ ${h.b('커스텀 전략 등록')}`,
      `${escapeHtml(created.name)} (${escapeHtml(created.ticker)})`,
      `조건: ${escapeHtml(condSummary)}`,
      `빈도: ${escapeHtml(created.frequency)}`,
      `id: <code>${escapeHtml(created.id.slice(-6))}</code>`,
    ].join('\n')
  )
}

/**
 * /커스텀전략목록 — 등록된 전체 커스텀 전략
 */
export async function decideCustomStrategyList(out: ReplyOutput): Promise<void> {
  const items = await prisma.customStrategy.findMany({
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
  })

  if (items.length === 0) {
    await out.reply(plainReply('등록된 커스텀 전략이 없습니다.\n\n"커스텀전략등록 <자연어>" 로 등록.'))
    return
  }

  const lines = [`📋 ${h.b('커스텀 전략 목록')}\n`, ...items.map(formatStrategyBlock)]
  await out.replyLong(lines.join('\n\n'))
}

/**
 * /커스텀전략삭제 <id 뒷자리 6자>
 */
export async function decideCustomStrategyDelete(arg: string, out: ReplyOutput): Promise<void> {

  if (!arg) {
    await out.reply(plainReply('사용법: 커스텀전략삭제 <id 뒷자리 6자>\n\n"커스텀전략목록" 으로 id 확인.'))
    return
  }

  // id 는 cuid — 뒷자리 6자로 endsWith 검색
  const candidates = await prisma.customStrategy.findMany({
    where: { id: { endsWith: arg } },
    take: 5,
  })

  if (candidates.length === 0) {
    await out.reply(plainReply(`⚠️ 해당 id 로 시작하는 전략을 찾을 수 없습니다: ${arg}`))
    return
  }

  if (candidates.length > 1) {
    const list = candidates.map((c) => `- [${c.id.slice(-6)}] ${c.name} (${c.ticker})`).join('\n')
    await out.reply(plainReply(`동일한 id 뒷자리 전략이 여러 개 있습니다:\n${list}\n\n더 긴 id 로 재시도해주세요.`))
    return
  }

  const target = candidates[0]
  await prisma.customStrategy.delete({ where: { id: target.id } })
  await out.reply(plainReply(`🗑️ 삭제됨: ${target.name} (${target.ticker})`))
}

export function registerCustomStrategyCommands(bot: Bot): void {
  // 등록에 try/catch 가 없다 — 판단 밖으로 던진 오류는 지금처럼 grammY bot.catch 로 간다
  const register = (ctx: Context) =>
    decideCustomStrategyRegister(customStrategyRegisterArgsFromText(ctx.message?.text ?? ''), telegramOutput(ctx))
  const list = (ctx: Context) => decideCustomStrategyList(telegramOutput(ctx))
  const remove = (ctx: Context) =>
    decideCustomStrategyDelete(customStrategyDeleteArgsFromText(ctx.message?.text ?? ''), telegramOutput(ctx))

  bot.command('customstrategy', register)
  bot.hears(CUSTOM_STRATEGY_REGISTER_RE, register)

  bot.command('customstrategylist', list)
  bot.hears(CUSTOM_STRATEGY_LIST_RE, list)

  bot.command('customstrategydelete', remove)
  bot.hears(CUSTOM_STRATEGY_DELETE_RE, remove)
}
