import type { Bot, Context } from 'grammy'
import { prisma } from '@/lib/prisma'
import {
  calcCurrentValueKRW,
  DEFAULT_FX_RATE_USD_KRW,
} from '@/lib/format'
import { formatKRWCompact, formatPercent } from '../utils/formatter'
import { escapeHtml, h } from '../utils/telegram'
import { plainReply, type ReplyOutput } from '../core/reply'
import { telegramOutput } from '../utils/telegram-reply'

/*
 * pleiades 009 D-3 PR-2a (pleiades#392 · 설계 `_workspace/009/d3/02_writer_d3_r3.md` §4 A2 · H2): 순자산 · 자산목록 · 자산추가 · 자산수정.
 * 판단(decide*)은 인자(`args`)와 중립 응답 모델만 안다 · 텔레그램 원문 벗기기는 `*ArgsFromText`(지금 식 그대로).
 * 특성 테스트 `__tests__/manage-telegram.test.ts` 가 텔레그램 호출열을 고정한다.
 */

export const NET_WORTH_RE = /^순자산\s*$/
export const ASSET_LIST_RE = /^자산목록\s*$/
export const ASSET_ADD_RE = /^자산추가(?:\s+.*)?$/
export const ASSET_UPDATE_RE = /^자산수정(?:\s+.*)?$/

/** 텔레그램 원문 → 인자 — `/assetadd[@bot]` · `자산추가` 를 벗기고 trim(대소문자 무시). */
export function assetAddArgsFromText(text: string): string {
  return text.replace(/^(\/assetadd(?:@\w+)?|자산추가)\s*/i, '').trim()
}

/** 텔레그램 원문 → 인자 — `/assetupdate[@bot]` · `자산수정` 을 벗기고 trim(대소문자 무시). */
export function assetUpdateArgsFromText(text: string): string {
  return text.replace(/^(\/assetupdate(?:@\w+)?|자산수정)\s*/i, '').trim()
}

/** 쉼표 제거 후 숫자 파싱 (3,000,000 → 3000000) */
function parseAmount(str: string): number {
  return parseFloat(str.replace(/,/g, ''))
}

const CATEGORY_LABELS: Record<string, string> = {
  savings: '💰 예적금',
  insurance: '🛡️ 보험',
  real_estate: '🏠 부동산',
  pension: '🏦 연금',
  loan: '🏦 대출',
  cash: '💵 현금',
  other: '📦 기타',
}

const CATEGORY_ALIASES: Record<string, string> = {
  '예적금': 'savings', '적금': 'savings', '예금': 'savings',
  '보험': 'insurance',
  '부동산': 'real_estate', '전세': 'real_estate',
  '연금': 'pension',
  '대출': 'loan',
  '현금': 'cash',
  '기타': 'other',
}

function resolveCategory(input: string): string | null {
  const lower = input.toLowerCase()
  if (Object.keys(CATEGORY_LABELS).includes(lower)) return lower
  return CATEGORY_ALIASES[input] ?? null
}

/**
 * 순자산 — 현재 순자산 요약
 */
export async function decideNetWorth(out: ReplyOutput): Promise<void> {
  // 환율
  const fxCache = await prisma.priceCache.findUnique({ where: { ticker: 'USDKRW=X' } })
  const fxRate = fxCache?.price ?? DEFAULT_FX_RATE_USD_KRW

  // 주식 평가액
  const holdings = await prisma.holding.findMany()
  const tickers = holdings.map((hld) => hld.ticker)
  const prices = tickers.length > 0
    ? await prisma.priceCache.findMany({ where: { ticker: { in: tickers } } })
    : []
  const priceMap = new Map(prices.map((p) => [p.ticker, p.price]))

  let stockValue = 0
  for (const hld of holdings) {
    const cp = priceMap.get(hld.ticker)
    if (cp != null) {
      stockValue += calcCurrentValueKRW(hld, cp, hld.currency === 'USD' ? fxRate : 1)
    } else if (hld.currency === 'USD' && hld.avgPriceFx != null) {
      stockValue += Math.round(hld.avgPriceFx * hld.shares * fxRate)
    } else {
      stockValue += Math.round(hld.avgPrice * hld.shares)
    }
  }

  // 비주식 자산 + 부채
  const assets = await prisma.asset.findMany()
  const assetValue = assets.filter((a) => !a.isLiability).reduce((s, a) => s + a.value, 0)
  const liabilityValue = assets.filter((a) => a.isLiability).reduce((s, a) => s + a.value, 0)
  const netWorth = stockValue + assetValue - liabilityValue

  // 전월 스냅샷
  const now = new Date()
  const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const prevSnapshot = await prisma.netWorthSnapshot.findFirst({
    where: { date: { lt: firstOfMonth } },
    orderBy: { date: 'desc' },
  })

  const lines = [
    `💰 ${h.b('가족 순자산')}\n`,
    `${h.b(formatKRWCompact(netWorth))}`,
  ]

  if (prevSnapshot) {
    const change = netWorth - prevSnapshot.netWorthKRW
    const changePct = prevSnapshot.netWorthKRW > 0
      ? (change / prevSnapshot.netWorthKRW) * 100 : 0
    lines.push(`전월 대비: ${formatKRWCompact(change)} (${formatPercent(changePct)})`)
  }

  lines.push('')
  lines.push(`📈 주식: ${formatKRWCompact(stockValue)}`)

  // 카테고리별 비주식 자산
  const catMap = new Map<string, number>()
  for (const a of assets) {
    if (a.isLiability) continue
    catMap.set(a.category, (catMap.get(a.category) ?? 0) + a.value)
  }
  for (const [cat, val] of Array.from(catMap.entries()).sort((a, b) => b[1] - a[1])) {
    const label = CATEGORY_LABELS[cat] ?? cat
    lines.push(`${label}: ${formatKRWCompact(val)}`)
  }

  if (liabilityValue > 0) {
    lines.push(`\n🏦 부채: -${formatKRWCompact(liabilityValue)}`)
  }

  lines.push(`\n💱 환율: ${fxRate.toLocaleString('ko-KR')}원/달러`)

  await out.replyLong(lines.join('\n'))
}

/**
 * 자산목록 — 전체 자산/부채 상세
 */
export async function decideAssetList(out: ReplyOutput): Promise<void> {
  const assets = await prisma.asset.findMany({
    orderBy: [{ isLiability: 'asc' }, { category: 'asc' }, { name: 'asc' }],
  })

  if (assets.length === 0) {
    await out.replyLong(
      `📦 등록된 자산이 없습니다.\n\n자산추가 [이름] [카테고리] [금액] 으로 등록하세요.`
    )
    return
  }

  const assetItems = assets.filter((a) => !a.isLiability)
  const liabilityItems = assets.filter((a) => a.isLiability)

  const lines = [`📦 ${h.b('자산/부채 현황')}\n`]

  if (assetItems.length > 0) {
    lines.push(h.b('자산'))
    for (const a of assetItems) {
      const label = CATEGORY_LABELS[a.category] ?? a.category
      let line = `  ${label} ${escapeHtml(a.name)}: ${formatKRWCompact(a.value)}`
      if (a.owner !== '공동') line += ` (${escapeHtml(a.owner)})`
      if (a.note) line += `\n    💬 ${escapeHtml(a.note)}`
      lines.push(line)
    }
    const totalAsset = assetItems.reduce((s, a) => s + a.value, 0)
    lines.push(`  ${h.b('합계')}: ${formatKRWCompact(totalAsset)}`)
  }

  if (liabilityItems.length > 0) {
    lines.push(`\n${h.b('부채')}`)
    for (const a of liabilityItems) {
      const label = CATEGORY_LABELS[a.category] ?? a.category
      let line = `  ${label} ${escapeHtml(a.name)}: ${formatKRWCompact(a.value)}`
      if (a.interestRate != null) line += ` (${a.interestRate}%)`
      if (a.note) line += `\n    💬 ${escapeHtml(a.note)}`
      lines.push(line)
    }
    const totalLiability = liabilityItems.reduce((s, a) => s + a.value, 0)
    lines.push(`  ${h.b('합계')}: -${formatKRWCompact(totalLiability)}`)
  }

  await out.replyLong(lines.join('\n'))
}

/**
 * 자산추가 [이름] [카테고리] [금액] [소유자]
 */
export async function decideAssetAdd(args: string, out: ReplyOutput): Promise<void> {

  if (!args) {
    await out.replyLong(
      `📦 ${h.b('자산 추가')}\n\n` +
      `사용법: 자산추가 [이름] [카테고리] [금액]\n` +
      `예: 자산추가 신한적금 적금 5000000\n` +
      `예: 자산추가 전세보증금 부동산 300000000\n\n` +
      `카테고리: 예적금, 보험, 부동산, 연금, 대출, 현금, 기타`
    )
    return
  }

  const parts = args.split(/\s+/)
  if (parts.length < 3) {
    await out.reply(plainReply('⚠️ 사용법: 자산추가 [이름] [카테고리] [금액]'))
    return
  }

  const name = parts[0]
  const catInput = parts[1]
  const valueStr = parts[2]
  const owner = parts[3] ?? '공동'

  const category = resolveCategory(catInput)
  if (!category) {
    await out.reply(plainReply(`⚠️ 알 수 없는 카테고리: ${catInput}\n사용 가능: 예적금, 보험, 부동산, 연금, 대출, 현금, 기타`))
    return
  }

  const value = parseAmount(valueStr)
  if (!Number.isFinite(value) || value < 0) {
    await out.reply(plainReply('⚠️ 유효한 금액을 입력해주세요.'))
    return
  }

  const isLiability = category === 'loan'

  const asset = await prisma.asset.create({
    data: {
      name,
      category,
      owner,
      value: Math.round(value),
      isLiability,
    },
  })

  const catLabel = CATEGORY_LABELS[category] ?? category
  await out.replyLong(
    `✅ 자산 등록 완료\n\n` +
    `${catLabel} ${h.b(escapeHtml(asset.name))}\n` +
    `금액: ${formatKRWCompact(asset.value)}\n` +
    `소유자: ${escapeHtml(asset.owner)}` +
    (isLiability ? '\n(부채로 분류)' : '')
  )
}

/**
 * 자산수정 [이름] [금액]
 */
export async function decideAssetUpdate(args: string, out: ReplyOutput): Promise<void> {

  if (!args) {
    await out.reply(plainReply('사용법: 자산수정 [이름] [금액]\n예: 자산수정 신한적금 5200000'))
    return
  }

  const parts = args.split(/\s+/)
  if (parts.length < 2) {
    await out.reply(plainReply('⚠️ 사용법: 자산수정 [이름] [금액]'))
    return
  }

  const name = parts[0]
  const valueStr = parts[1]
  const value = parseAmount(valueStr)

  if (!Number.isFinite(value) || value < 0) {
    await out.reply(plainReply('⚠️ 유효한 금액을 입력해주세요.'))
    return
  }

  const matches = await prisma.asset.findMany({
    where: { name: { equals: name, mode: 'insensitive' } },
    take: 5,
  })

  if (matches.length === 0) {
    await out.reply(plainReply(`⚠️ 자산을 찾을 수 없습니다: ${name}\n자산목록 으로 확인해주세요.`))
    return
  }

  if (matches.length > 1) {
    const list = matches.map((a) => `- ${escapeHtml(a.name)} (${escapeHtml(a.owner)}, ${CATEGORY_LABELS[a.category] ?? a.category})`).join('\n')
    await out.replyLong(`⚠️ 동일 이름 자산이 여러 개 있습니다:\n${list}\n\n웹에서 수정하거나 이름을 구분해주세요.`)
    return
  }

  const asset = matches[0]

  const oldValue = asset.value
  const updated = await prisma.asset.update({
    where: { id: asset.id },
    data: { value: Math.round(value) },
  })

  await out.replyLong(
    `✅ 자산 수정 완료\n\n` +
    `${h.b(escapeHtml(updated.name))}\n` +
    `이전: ${formatKRWCompact(oldValue)} → 변경: ${formatKRWCompact(updated.value)}`
  )
}

export function registerNetWorthCommands(bot: Bot): void {
  // 등록에 try/catch 가 없다 — 판단 밖으로 던진 오류는 지금처럼 grammY bot.catch 로 간다
  const netWorth = (ctx: Context) => decideNetWorth(telegramOutput(ctx))
  const assetList = (ctx: Context) => decideAssetList(telegramOutput(ctx))
  const assetAdd = (ctx: Context) => decideAssetAdd(assetAddArgsFromText(ctx.message?.text ?? ''), telegramOutput(ctx))
  const assetUpdate = (ctx: Context) => decideAssetUpdate(assetUpdateArgsFromText(ctx.message?.text ?? ''), telegramOutput(ctx))

  bot.command('networth', netWorth)
  bot.hears(NET_WORTH_RE, netWorth)

  bot.command('assetlist', assetList)
  bot.hears(ASSET_LIST_RE, assetList)

  bot.command('assetadd', assetAdd)
  bot.hears(ASSET_ADD_RE, assetAdd)

  bot.command('assetupdate', assetUpdate)
  bot.hears(ASSET_UPDATE_RE, assetUpdate)
}
