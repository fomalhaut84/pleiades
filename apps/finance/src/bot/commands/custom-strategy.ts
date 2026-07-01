import { Bot, Context } from 'grammy'
import { prisma } from '@/lib/prisma'
import { parseStrategyText } from '@/lib/custom-strategy/parser'
import { conditionToString, type Condition } from '@/lib/custom-strategy/types'
import { replyHtml, escapeHtml, h } from '../utils/telegram'

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
async function handleRegister(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? ''
  const body = text.replace(/^(\/customstrategy|커스텀전략등록)\s*/i, '').trim()

  if (!body) {
    await ctx.reply(
      '⚙️ 커스텀 전략 등록\n\n' +
      '사용법: 커스텀전략등록 <자연어 전략>\n\n' +
      '예시:\n' +
      '- 커스텀전략등록 SOXL 40달러 이하 + RSI 30 이하 시 매수 알림\n' +
      '- 커스텀전략등록 NVDA MACD 골든크로스 시 알림\n' +
      '- 커스텀전략등록 TSLA 볼린저밴드 하단 이탈 시 알림\n\n' +
      '지원 조건: 현재가, RSI, MACD 크로스, SMA 크로스, 볼밴 위치, 기간별 변동률'
    )
    return
  }

  const activeCount = await prisma.customStrategy.count({ where: { isActive: true } })
  if (activeCount >= MAX_STRATEGIES) {
    await ctx.reply(`⚠️ 활성 전략은 최대 ${MAX_STRATEGIES}개까지만 등록 가능합니다. 기존 전략을 삭제한 후 다시 시도해주세요.`)
    return
  }

  await ctx.reply('🤖 전략 파싱 중... (최대 60초)')

  let parsed
  try {
    parsed = await parseStrategyText(body)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    await ctx.reply(`⚠️ 전략 파싱 실패\n\n${msg}\n\n표현을 바꿔서 다시 시도해주세요.`)
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
  await replyHtml(
    ctx,
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
async function handleList(ctx: Context): Promise<void> {
  const items = await prisma.customStrategy.findMany({
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
  })

  if (items.length === 0) {
    await ctx.reply('등록된 커스텀 전략이 없습니다.\n\n"커스텀전략등록 <자연어>" 로 등록.')
    return
  }

  const lines = [`📋 ${h.b('커스텀 전략 목록')}\n`, ...items.map(formatStrategyBlock)]
  await replyHtml(ctx, lines.join('\n\n'))
}

/**
 * /커스텀전략삭제 <id 뒷자리 6자>
 */
async function handleDelete(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? ''
  const arg = text.replace(/^(\/customstrategydelete|커스텀전략삭제)\s*/i, '').trim()

  if (!arg) {
    await ctx.reply('사용법: 커스텀전략삭제 <id 뒷자리 6자>\n\n"커스텀전략목록" 으로 id 확인.')
    return
  }

  // id 는 cuid — 뒷자리 6자로 endsWith 검색
  const candidates = await prisma.customStrategy.findMany({
    where: { id: { endsWith: arg } },
    take: 5,
  })

  if (candidates.length === 0) {
    await ctx.reply(`⚠️ 해당 id 로 시작하는 전략을 찾을 수 없습니다: ${arg}`)
    return
  }

  if (candidates.length > 1) {
    const list = candidates.map((c) => `- [${c.id.slice(-6)}] ${c.name} (${c.ticker})`).join('\n')
    await ctx.reply(`동일한 id 뒷자리 전략이 여러 개 있습니다:\n${list}\n\n더 긴 id 로 재시도해주세요.`)
    return
  }

  const target = candidates[0]
  await prisma.customStrategy.delete({ where: { id: target.id } })
  await ctx.reply(`🗑️ 삭제됨: ${target.name} (${target.ticker})`)
}

export function registerCustomStrategyCommands(bot: Bot): void {
  bot.command('customstrategy', handleRegister)
  bot.hears(/^커스텀전략등록(?:\s+.*)?$/, handleRegister)

  bot.command('customstrategylist', handleList)
  bot.hears(/^커스텀전략목록\s*$/, handleList)

  bot.command('customstrategydelete', handleDelete)
  bot.hears(/^커스텀전략삭제(?:\s+.*)?$/, handleDelete)
}
