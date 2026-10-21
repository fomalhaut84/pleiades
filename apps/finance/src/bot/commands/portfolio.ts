import { Bot, Context } from 'grammy'
import { prisma } from '@/lib/prisma'
import {
  calcCostKRW,
  calcCurrentValueKRW,
  calcProfitLoss,
  DEFAULT_FX_RATE_USD_KRW,
} from '@/lib/format'
import {
  accountEmoji,
  formatKRWFull,
  formatPercent,
  formatSignedKRW,
  formatUSD,
  profitEmoji,
} from '../utils/formatter'
import { replyHtml, escapeHtml, h } from '../utils/telegram'

interface AccountSummary {
  name: string
  currentValueKRW: number
  costKRW: number
  returnPct: number
}

async function fetchPortfolioData() {
  const [accounts, prices] = await Promise.all([
    prisma.account.findMany({
      include: {
        holdings: { orderBy: { avgPrice: 'desc' } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.priceCache.findMany(),
  ])

  const priceMap = new Map(prices.map((p) => [p.ticker, p]))
  const fxData = priceMap.get('USDKRW=X')
  const currentFxRate = fxData?.price ?? DEFAULT_FX_RATE_USD_KRW

  return { accounts, priceMap, currentFxRate, fxPrice: fxData?.price }
}

function buildAccountSummary(
  account: Awaited<ReturnType<typeof fetchPortfolioData>>['accounts'][0],
  priceMap: Map<string, { ticker: string; price: number; change: number | null }>,
  currentFxRate: number
): AccountSummary {
  const costKRW = account.holdings.reduce((sum, h) => sum + calcCostKRW(h), 0)

  const currentValueKRW = account.holdings.reduce((sum, h) => {
    const price = priceMap.get(h.ticker)
    if (!price) return sum + calcCostKRW(h)
    return sum + calcCurrentValueKRW(h, price.price, currentFxRate)
  }, 0)

  const returnPct = costKRW > 0 ? ((currentValueKRW - costKRW) / costKRW) * 100 : 0

  return { name: account.name, currentValueKRW, costKRW, returnPct }
}

async function handlePortfolioSummary(ctx: Context): Promise<void> {
  const { accounts, priceMap, currentFxRate, fxPrice } = await fetchPortfolioData()

  const summaries = accounts.map((a) => buildAccountSummary(a, priceMap, currentFxRate))

  const totalValue = summaries.reduce((s, a) => s + a.currentValueKRW, 0)
  const totalCost = summaries.reduce((s, a) => s + a.costKRW, 0)
  const totalReturnPct = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0

  const lines = [`📊 ${h.b('포트폴리오 현황')}\n`]

  for (const s of summaries) {
    const emoji = accountEmoji(s.name)
    lines.push(
      `${emoji} ${h.b(escapeHtml(s.name))}  ${formatKRWFull(s.currentValueKRW)}  (${formatPercent(s.returnPct)})`
    )
  }

  lines.push('─────────────────────')
  lines.push(`${h.b('합계')}    ${formatKRWFull(totalValue)}  (${formatPercent(totalReturnPct)})`)

  if (fxPrice) {
    lines.push(`\n환율: $1 = ₩${fxPrice.toFixed(2)}`)
  }

  await replyHtml(ctx, lines.join('\n'))
}

async function handleAccountDetail(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? ''
  const match = text.match(/^계좌\s+(.+)$/)
  const accountName = match?.[1]?.trim()

  if (!accountName) {
    await ctx.reply('사용법: 계좌 [이름]\n예: 계좌 세진')
    return
  }

  const { accounts, priceMap, currentFxRate } = await fetchPortfolioData()

  // 정확 일치 우선, 없으면 부분 매칭
  const exactMatch = accounts.find((a) => a.name === accountName)
  const candidates = exactMatch
    ? [exactMatch]
    : accounts.filter((a) => a.name.includes(accountName))

  if (candidates.length === 0) {
    const names = accounts.map((a) => escapeHtml(a.name)).join(', ')
    await replyHtml(ctx, `계좌를 찾을 수 없습니다: ${escapeHtml(accountName!)}\n사용 가능: ${names}`)
    return
  }

  if (candidates.length > 1) {
    const names = candidates.map((a) => escapeHtml(a.name)).join(', ')
    await replyHtml(ctx, `여러 계좌가 매칭됩니다: ${names}\n정확한 이름을 입력해주세요.`)
    return
  }

  const account = candidates[0]

  const summary = buildAccountSummary(account, priceMap, currentFxRate)

  const lines = [`${accountEmoji(account.name)} ${h.b(escapeHtml(account.name) + ' 계좌 상세')}\n`]

  for (const holding of account.holdings) {
    const price = priceMap.get(holding.ticker)
    if (!price) {
      lines.push(`${escapeHtml(holding.displayName)}  ${holding.shares}주  (가격 미수신)`)
      continue
    }

    const pl = calcProfitLoss(holding, price.price, currentFxRate)
    const emoji = profitEmoji(pl.returnPct)
    const priceStr = holding.currency === 'USD' ? formatUSD(price.price) : `₩${price.price.toLocaleString('ko-KR')}`

    lines.push(
      `${escapeHtml(holding.displayName)}  ${holding.shares}주  ${priceStr}  ${formatSignedKRW(pl.totalPL)} (${formatPercent(pl.returnPct)}) ${emoji}`
    )
  }

  lines.push('─────────────────────')
  lines.push(`${h.b('총 평가액')}: ${formatKRWFull(summary.currentValueKRW)}`)
  lines.push(`${h.b('총 수익률')}: ${formatPercent(summary.returnPct)}`)

  await replyHtml(ctx, lines.join('\n'))
}

export function registerPortfolioCommands(bot: Bot): void {
  bot.hears(/^현황$/, async (ctx) => {
    try {
      await handlePortfolioSummary(ctx)
    } catch (error) {
      console.error('[bot] 현황 조회 실패:', error)
      await ctx.reply('⚠️ 포트폴리오 조회에 실패했습니다.')
    }
  })

  bot.hears(/^계좌(\s+.+)?$/, async (ctx) => {
    try {
      await handleAccountDetail(ctx)
    } catch (error) {
      console.error('[bot] 계좌 조회 실패:', error)
      await ctx.reply('⚠️ 계좌 조회에 실패했습니다.')
    }
  })
}
