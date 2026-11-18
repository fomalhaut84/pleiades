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
import { escapeHtml } from '../utils/html'
import { plainReply, type ReplyOutput } from '../core/reply'
import { profitColor, rowListCard } from '../utils/card'

/*
 * pleiades 009 D-3 PR-2a (pleiades#392 · 설계 `_workspace/009/d3/02_writer_d3_r3.md` §4 A2 · H2): 현황 · 계좌.
 * 판단(decide*)은 중립 응답 모델(`../core/reply`)로만 말한다(수신은 `../discord/router` · 009 D-5 B3b 에서 옛 채널 등록부 삭제).
 * 판단 흐름은 `__tests__/lookup-flow.test.ts` · `manage-flow.test.ts` 가 고정한다(009 D-5 B3a).
 */

export const PORTFOLIO_SUMMARY_RE = /^현황$/
export const ACCOUNT_DETAIL_RE = /^계좌(\s+.+)?$/

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

export async function decidePortfolioSummary(out: ReplyOutput): Promise<void> {
  const { accounts, priceMap, currentFxRate, fxPrice } = await fetchPortfolioData()

  const summaries = accounts.map((a) => buildAccountSummary(a, priceMap, currentFxRate))

  const totalValue = summaries.reduce((s, a) => s + a.currentValueKRW, 0)
  const totalCost = summaries.reduce((s, a) => s + a.costKRW, 0)
  const totalReturnPct = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0

  // 013 P3-b1 (#777) — 위 한 줄 = 제목 + 핵심 숫자(F7 · 푸시 미리보기) · 계좌는 행 목록 카드(F8) · 색 = 합계 손익(F6)
  const card = rowListCard(
    '계좌별',
    summaries.map((s) => ({
      label: `${accountEmoji(s.name)} ${s.name}`,
      text: `${formatKRWFull(s.currentValueKRW)} · ${formatPercent(s.returnPct)}`,
    })),
    {
      color: profitColor(totalReturnPct),
      empty: '계좌가 없습니다.',
      ...(fxPrice ? { footer: `환율 $1 = ₩${fxPrice.toFixed(2)}` } : {}),
    },
  )
  await out.reply({
    text: `📊 포트폴리오 현황 · 합계 ${formatKRWFull(totalValue)} (${formatPercent(totalReturnPct)})`,
    format: 'plain',
    cards: [card],
  })
}

/** 계좌 상세 — 원문 전체를 받는다(이름은 `계좌\s+(.+)` 로 꺼낸다 · 설계 A2 "원문을 쓰는 파싱"). */
export async function decideAccountDetail(text: string, out: ReplyOutput): Promise<void> {
  const match = text.match(/^계좌\s+(.+)$/)
  const accountName = match?.[1]?.trim()

  if (!accountName) {
    await out.reply(plainReply('사용법: 계좌 [이름]\n예: 계좌 세진'))
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
    await out.replyLong(`계좌를 찾을 수 없습니다: ${escapeHtml(accountName!)}\n사용 가능: ${names}`)
    return
  }

  if (candidates.length > 1) {
    const names = candidates.map((a) => escapeHtml(a.name)).join(', ')
    await out.replyLong(`여러 계좌가 매칭됩니다: ${names}\n정확한 이름을 입력해주세요.`)
    return
  }

  const account = candidates[0]

  const summary = buildAccountSummary(account, priceMap, currentFxRate)

  // 013 P3-b1 (#777) — 위 한 줄 = 계좌 · 평가 · 수익률(F7) · 종목은 행 목록 카드(F8) · 색 = 계좌 손익(F6)
  const rows = account.holdings.map((holding) => {
    const price = priceMap.get(holding.ticker)
    if (!price) return { label: holding.displayName, text: `${holding.shares}주 · 가격 미수신` }
    const pl = calcProfitLoss(holding, price.price, currentFxRate)
    const priceStr = holding.currency === 'USD' ? formatUSD(price.price) : `₩${price.price.toLocaleString('ko-KR')}`
    return {
      label: holding.displayName,
      text: `${holding.shares}주 · ${priceStr} · ${formatSignedKRW(pl.totalPL)} (${formatPercent(pl.returnPct)}) ${profitEmoji(pl.returnPct)}`,
    }
  })
  await out.reply({
    text: `${accountEmoji(account.name)} ${account.name} 계좌 · 평가 ${formatKRWFull(summary.currentValueKRW)} (${formatPercent(summary.returnPct)})`,
    format: 'plain',
    cards: [rowListCard('보유 종목', rows, { color: profitColor(summary.returnPct), empty: '보유 종목이 없습니다.' })],
  })
}
