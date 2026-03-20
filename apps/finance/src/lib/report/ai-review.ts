/**
 * AI 분기 리뷰 분석
 *
 * askAdvisor로 분기 데이터를 기반으로 종합 분석 코멘트 생성.
 */

import { askAdvisor } from '@/lib/ai/claude-advisor'
import { prisma } from '@/lib/prisma'
import type { QuarterlyData } from './data-collector'

function formatKRW(n: number): string {
  return `${Math.round(n).toLocaleString('ko-KR')}원`
}

function buildReviewPrompt(data: QuarterlyData): string {
  const q = `${data.year}년 ${data.quarter}분기`

  const accountLines = data.portfolio.accounts
    .map((a) => `- ${a.name}: ${formatKRW(a.valueKRW)} (${a.returnPct >= 0 ? '+' : ''}${a.returnPct.toFixed(1)}%, ${a.holdingCount}종목)`)
    .join('\n')

  const giftLines = data.giftTax
    .map((g) => `- ${g.accountName}: 증여 ${formatKRW(g.totalGifted)} / 한도 ${formatKRW(g.exemptLimit)} (${(g.usageRate * 100).toFixed(0)}%)`)
    .join('\n')

  return [
    `${q} 분기 리포트의 AI 분석 코멘트를 작성해줘.\n`,
    '다음 데이터를 기반으로 분석해:',
    '',
    `**포트폴리오 현황**`,
    `총 평가금: ${formatKRW(data.portfolio.totalValueKRW)} (수익률 ${data.portfolio.returnPct >= 0 ? '+' : ''}${data.portfolio.returnPct.toFixed(1)}%)`,
    accountLines,
    '',
    `**분기 거래**: ${data.trades.total}건 (매수 ${data.trades.buys}, 매도 ${data.trades.sells})`,
    `**배당**: ${data.dividends.count}건, ${formatKRW(data.dividends.totalKRW)}`,
    `**환율**: ${data.fxRate.toLocaleString('ko-KR')}원/달러`,
    '',
    data.giftTax.length > 0 ? `**증여세 현황**\n${giftLines}` : '',
    '',
    '분석 내용:',
    '1. 분기 성과 총평 (잘한 점, 아쉬운 점)',
    '2. 계좌별 전략 이행 평가',
    '3. 다음 분기 체크포인트 및 제안',
    '4. 증여세 관리 코멘트 (미성년 계좌)',
    '',
    '투자 권유가 아닌 정보 제공임을 명시.',
  ].join('\n')
}

/**
 * 분기 리포트 생성 + DB 저장
 */
export async function generateQuarterlyReview(
  year: number,
  quarter: number,
  data: QuarterlyData
): Promise<{ id: string; aiComment: string }> {
  const prompt = buildReviewPrompt(data)
  const result = await askAdvisor(prompt, {
    model: 'sonnet',
    timeout: 300_000,
    maxBudgetUsd: 1.0,
  })

  const title = `${year}년 ${quarter}분기 리포트`

  const report = await prisma.quarterlyReport.upsert({
    where: { year_quarter: { year, quarter } },
    update: {
      title,
      summary: JSON.parse(JSON.stringify(data)),
      aiComment: result.response,
    },
    create: {
      year,
      quarter,
      title,
      summary: JSON.parse(JSON.stringify(data)),
      aiComment: result.response,
    },
  })

  return { id: report.id, aiComment: result.response }
}
