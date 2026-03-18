import { Bot, Context } from 'grammy'
import { prisma } from '@/lib/prisma'

const STRATEGY_LABELS: Record<string, string> = {
  long_hold: '📦 장기보유',
  swing: '🔄 스윙',
  momentum: '🚀 모멘텀',
  value: '💎 가치투자',
  watch: '👀 감시',
  scalp: '⚡ 단타',
}

const VALID_STRATEGIES = Object.keys(STRATEGY_LABELS)

const STRATEGY_ALIASES: Record<string, string> = {
  '장기보유': 'long_hold', '장기': 'long_hold', '홀드': 'long_hold',
  '스윙': 'swing',
  '모멘텀': 'momentum',
  '가치투자': 'value', '가치': 'value',
  '감시': 'watch',
  '단타': 'scalp',
}

function resolveStrategy(input: string): string | null {
  const lower = input.toLowerCase()
  if (VALID_STRATEGIES.includes(lower)) return lower
  return STRATEGY_ALIASES[input] ?? null
}

function formatStrategy(strategy: string): string {
  return STRATEGY_LABELS[strategy] ?? strategy
}

/**
 * /전략 [종목] [전략] [옵션...]
 * /전략 NVDA 스윙
 * /전략 NVDA 목표가 160
 * /전략 NVDA 손절 110
 * /전략 NVDA 매수구간 120 130
 * /전략 NVDA 메모 "3일선 돌파 매수"
 * /전략 컨텍 감시 점검일 2026-06-01
 */
async function handleStrategy(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? ''
  const args = text.replace(/^(\/strategy|전략)\s*/, '').trim()

  if (!args) {
    await ctx.reply(
      '⚙️ 전략 설정\n\n' +
      '사용법:\n' +
      '전략 [종목] [전략] — 전략 변경\n' +
      '전략 [종목] 목표가 [가격]\n' +
      '전략 [종목] 손절 [가격]\n' +
      '전략 [종목] 매수구간 [하한] [상한]\n' +
      '전략 [종목] 메모 [내용]\n' +
      '전략 [종목] 점검일 [YYYY-MM-DD]\n\n' +
      `전략 종류: ${VALID_STRATEGIES.map((s) => `${formatStrategy(s)}`).join(', ')}`
    )
    return
  }

  const parts = args.split(/\s+/)
  const tickerOrName = parts[0]

  // 종목 찾기 (ticker 또는 displayName)
  // "계좌명 종목" 형태도 지원: 전략 세진 NVDA 스윙
  let accountFilter: string | undefined
  let tickerQuery = tickerOrName

  // 첫 번째 인자가 계좌명인 경우
  const accountNames = ['세진', '소담', '다솜']
  if (accountNames.includes(tickerOrName) && parts.length >= 2) {
    accountFilter = tickerOrName
    tickerQuery = parts[1]
    parts.splice(0, 1) // 계좌명 제거, parts[0]이 종목이 됨
  }

  const holdings = await prisma.holding.findMany({
    where: {
      ...(accountFilter ? { account: { name: accountFilter } } : {}),
      OR: [
        { ticker: tickerQuery.toUpperCase() },
        { displayName: { equals: tickerQuery, mode: 'insensitive' } },
      ],
    },
    include: { strategy: true, account: { select: { name: true } } },
    take: 5,
  })

  if (holdings.length === 0) {
    await ctx.reply(`⚠️ 보유 종목을 찾을 수 없습니다: ${tickerQuery}`)
    return
  }

  if (holdings.length > 1) {
    const candidates = holdings.map((h) => `- ${h.account.name} / ${h.displayName} (${h.ticker})`).join('\n')
    await ctx.reply(`여러 계좌에 같은 종목이 있습니다. 계좌명을 포함해주세요:\n\n${candidates}\n\n예: 전략 세진 ${tickerQuery} 스윙`)
    return
  }

  const holding = holdings[0]

  // 인자 1개 = 종목만 → 현재 전략 표시
  if (parts.length === 1) {
    const s = holding.strategy
    const lines = [
      `📋 ${holding.displayName} (${holding.ticker}) — ${holding.account.name}`,
      `전략: ${formatStrategy(s?.strategy ?? 'long_hold')}`,
    ]
    if (s?.memo) lines.push(`메모: ${s.memo}`)
    if (s?.targetPrice != null) lines.push(`목표가: ${s.targetPrice}`)
    if (s?.stopLoss != null) lines.push(`손절가: ${s.stopLoss}`)
    if (s?.entryLow != null && s?.entryHigh != null) lines.push(`매수구간: ${s.entryLow} ~ ${s.entryHigh}`)
    if (s?.reviewDate) lines.push(`점검일: ${s.reviewDate.toISOString().slice(0, 10)}`)
    await ctx.reply(lines.join('\n'))
    return
  }

  const subCmd = parts[1]

  // 전략 변경
  const resolved = resolveStrategy(subCmd)
  if (resolved) {
    const remaining = parts.slice(2)
    let memo: string | undefined
    let reviewDate: Date | undefined

    // 추가 옵션 파싱
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i] === '점검일' && remaining[i + 1]) {
        const d = new Date(remaining[i + 1])
        if (!isNaN(d.getTime())) reviewDate = d
        i++
      } else {
        // 나머지는 메모로
        memo = remaining.slice(i).join(' ').replace(/^["']|["']$/g, '')
        break
      }
    }

    await prisma.holdingStrategy.upsert({
      where: { holdingId: holding.id },
      update: {
        strategy: resolved,
        ...(memo !== undefined ? { memo } : {}),
        ...(reviewDate ? { reviewDate } : {}),
      },
      create: {
        holdingId: holding.id,
        strategy: resolved,
        memo: memo ?? null,
        reviewDate: reviewDate ?? null,
      },
    })

    await ctx.reply(
      `✅ ${holding.displayName} (${holding.ticker}) 전략 변경\n` +
      `→ ${formatStrategy(resolved)}` +
      (memo ? `\n메모: ${memo}` : '') +
      (reviewDate ? `\n점검일: ${reviewDate.toISOString().slice(0, 10)}` : '')
    )
    return
  }

  // 목표가
  if (subCmd === '목표가' && parts[2]) {
    const price = parseFloat(parts[2])
    if (!Number.isFinite(price) || price <= 0) {
      await ctx.reply('⚠️ 유효한 가격을 입력해주세요.')
      return
    }
    await prisma.holdingStrategy.upsert({
      where: { holdingId: holding.id },
      update: { targetPrice: price },
      create: { holdingId: holding.id, targetPrice: price },
    })
    await ctx.reply(`✅ ${holding.displayName} 목표가: ${price}`)
    return
  }

  // 손절
  if (subCmd === '손절' && parts[2]) {
    const price = parseFloat(parts[2])
    if (!Number.isFinite(price) || price <= 0) {
      await ctx.reply('⚠️ 유효한 가격을 입력해주세요.')
      return
    }
    await prisma.holdingStrategy.upsert({
      where: { holdingId: holding.id },
      update: { stopLoss: price },
      create: { holdingId: holding.id, stopLoss: price },
    })
    await ctx.reply(`✅ ${holding.displayName} 손절가: ${price}`)
    return
  }

  // 매수구간
  if (subCmd === '매수구간' && parts[2] && parts[3]) {
    const low = parseFloat(parts[2])
    const high = parseFloat(parts[3])
    if (!Number.isFinite(low) || !Number.isFinite(high) || low <= 0 || high <= 0 || low >= high) {
      await ctx.reply('⚠️ 유효한 매수구간을 입력해주세요. (하한 < 상한)')
      return
    }
    await prisma.holdingStrategy.upsert({
      where: { holdingId: holding.id },
      update: { entryLow: low, entryHigh: high },
      create: { holdingId: holding.id, entryLow: low, entryHigh: high },
    })
    await ctx.reply(`✅ ${holding.displayName} 매수구간: ${low} ~ ${high}`)
    return
  }

  // 메모
  if (subCmd === '메모') {
    const memo = parts.slice(2).join(' ').replace(/^["']|["']$/g, '')
    await prisma.holdingStrategy.upsert({
      where: { holdingId: holding.id },
      update: { memo: memo || null },
      create: { holdingId: holding.id, memo: memo || null },
    })
    await ctx.reply(memo ? `✅ ${holding.displayName} 메모: ${memo}` : `✅ ${holding.displayName} 메모 삭제`)
    return
  }

  // 점검일
  if (subCmd === '점검일' && parts[2]) {
    const d = new Date(parts[2])
    if (isNaN(d.getTime())) {
      await ctx.reply('⚠️ 유효한 날짜를 입력해주세요. (YYYY-MM-DD)')
      return
    }
    await prisma.holdingStrategy.upsert({
      where: { holdingId: holding.id },
      update: { reviewDate: d },
      create: { holdingId: holding.id, reviewDate: d },
    })
    await ctx.reply(`✅ ${holding.displayName} 점검일: ${d.toISOString().slice(0, 10)}`)
    return
  }

  await ctx.reply(
    '⚠️ 알 수 없는 명령입니다.\n' +
    '전략 [종목] [전략/목표가/손절/매수구간/메모/점검일] [값]'
  )
}

/**
 * /전략목록 — 전체 보유 종목 전략 현황
 */
async function handleStrategyList(ctx: Context): Promise<void> {
  const accounts = await prisma.account.findMany({
    include: {
      holdings: {
        include: { strategy: true },
        orderBy: { ticker: 'asc' },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  const lines = ['📋 종목별 전략 현황\n']

  for (const account of accounts) {
    if (account.holdings.length === 0) continue
    lines.push(`**${account.name}**`)
    for (const h of account.holdings) {
      const s = h.strategy
      const strat = formatStrategy(s?.strategy ?? 'long_hold')
      let detail = `- ${h.displayName} (${h.ticker}): ${strat}`
      if (s?.targetPrice != null) detail += ` | 목표 ${s.targetPrice}`
      if (s?.stopLoss != null) detail += ` | 손절 ${s.stopLoss}`
      if (s?.memo) detail += ` | ${s.memo}`
      if (s?.reviewDate) detail += ` | 점검 ${s.reviewDate.toISOString().slice(0, 10)}`
      lines.push(detail)
    }
    lines.push('')
  }

  await ctx.reply(lines.join('\n'))
}

export function registerStrategyCommands(bot: Bot): void {
  bot.command('strategy', handleStrategy)
  bot.hears(/^전략(?:\s+.*)?$/, handleStrategy)

  bot.command('strategylist', handleStrategyList)
  bot.hears(/^전략목록\s*$/, handleStrategyList)
}
