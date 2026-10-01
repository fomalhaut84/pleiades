'use client'

import Link from 'next/link'

interface HoldingData {
  ticker: string
  displayName: string
  emoji: string
  description: string
  valueKRW: number
  costKRW: number
  returnPct: number
  shares: number
}

interface Props {
  accountId: string
  accountName: string
  ownerAge: number | null
  level: { level: number; label: string; emoji: string }
  totalValue: number
  totalCost: number
  totalReturn: number
  holdings: HoldingData[]
  dividendTotal: number
  compoundFinalValue: number
  compoundYears: number
  compoundMonthly: number
}

function formatKRW(n: number): string {
  if (n >= 1_0000_0000) return `약 ${(n / 1_0000_0000).toFixed(1)}억원`
  if (n >= 1_0000) return `약 ${Math.round(n / 1_0000).toLocaleString('ko-KR')}만원`
  return `${Math.round(n).toLocaleString('ko-KR')}원`
}

const ACCOUNT_EMOJI: Record<string, string> = { '소담': '👧', '다솜': '👶' }

export default function KidsClient({
  accountId, accountName, ownerAge, level, totalValue, totalCost, totalReturn,
  holdings, dividendTotal, compoundFinalValue, compoundYears, compoundMonthly,
}: Props) {
  const accountEmoji = ACCOUNT_EMOJI[accountName] ?? '👤'
  const growth = totalValue - totalCost

  return (
    <div className="min-h-screen px-4 sm:px-8 py-8 max-w-[600px] mx-auto">
      {/* 헤더 */}
      <div className="text-center mb-8">
        <h1 className="text-[28px] font-extrabold text-bright">
          <span className="text-[36px]">{accountEmoji}</span> {accountName}이의 투자 일기
        </h1>
        <p className="text-[14px] text-sub mt-1">
          {level.emoji} {level.label} 레벨 {ownerAge != null ? `(${ownerAge}세)` : ''}
        </p>
      </div>

      {/* 총 자산 카드 */}
      <div className="relative overflow-hidden rounded-[20px] border border-sodam/20 bg-sodam/5 p-7 text-center mb-6">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-sodam to-transparent opacity-60" />
        <div className="text-[14px] text-sub">💰 내 투자 총액</div>
        <div className="text-[36px] font-extrabold text-bright mt-2">
          {formatKRW(totalValue)}
        </div>
        <div className={`text-[16px] font-semibold mt-1 ${growth >= 0 ? 'text-sejin' : 'text-red-400'}`}>
          {growth >= 0 ? '📈' : '📉'} {growth >= 0 ? '+' : ''}{formatKRW(growth)} 자랐어! ({totalReturn >= 0 ? '+' : ''}{totalReturn.toFixed(1)}%)
        </div>
      </div>

      {/* 보유 종목 */}
      <h2 className="text-[18px] font-bold text-bright mb-3">🏢 내가 가진 회사들</h2>
      <div className="flex flex-col gap-3 mb-6">
        {holdings.map((h) => (
          <div key={h.ticker} className="flex items-center gap-4 p-4 rounded-[16px] bg-card border border-border">
            <span className="text-[32px]">{h.emoji}</span>
            <div className="flex-1">
              <div className="text-[15px] font-bold text-bright">{h.displayName}</div>
              <div className="text-[12px] text-sub">{h.description}</div>
            </div>
            <div className="text-right">
              <div className="text-[14px] font-semibold text-bright">{formatKRW(h.valueKRW)}</div>
              <div className={`text-[13px] font-semibold ${h.returnPct >= 0 ? 'text-sejin' : 'text-red-400'}`}>
                {h.returnPct >= 0 ? '+' : ''}{h.returnPct.toFixed(1)}% {h.returnPct >= 100 ? '🚀' : h.returnPct >= 0 ? '📈' : '📉'}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 배당금 */}
      {dividendTotal > 0 && (
        <>
          <h2 className="text-[18px] font-bold text-bright mb-3">🎁 회사가 준 용돈 (배당금)</h2>
          <div className="rounded-[16px] border border-yellow-500/15 bg-yellow-500/5 p-5 text-center mb-6">
            <span className="text-[40px]">🎁</span>
            <div className="text-[14px] text-yellow-400 mt-2">올해 회사들이 {accountName}이에게 준 용돈</div>
            <div className="text-[20px] font-bold text-bright mt-1">{formatKRW(dividendTotal)}</div>
          </div>
        </>
      )}

      {/* 복리 미리보기 */}
      <h2 className="text-[18px] font-bold text-bright mb-3">🔮 미래 미리보기</h2>
      <div className="rounded-[16px] border border-sejin/15 bg-sejin/5 p-5 text-center">
        <div className="text-[14px] text-sejin">
          매달 {(compoundMonthly / 10000).toFixed(0)}만원씩 넣으면 {compoundYears}년 후
        </div>
        <div className="text-[24px] font-extrabold text-bright mt-2">
          {formatKRW(compoundFinalValue)}!
        </div>
        <div className="text-[12px] text-sub mt-2">
          지금 가진 돈이 계속 자라면서 + 매달 조금씩 넣으면 이렇게 돼요 ✨
        </div>
      </div>

      {/* 타임라인 링크 */}
      <Link
        href={`/kids/${accountId}/timeline`}
        className="block mt-6 rounded-[16px] border border-border bg-card p-5 text-center
          hover:bg-card-hover hover:border-border-hover transition-all"
      >
        <span className="text-[24px]">📖</span>
        <div className="text-[14px] font-bold text-bright mt-2">내 투자 이야기 보기</div>
        <div className="text-[12px] text-sub mt-1">투자를 시작한 날부터 지금까지</div>
      </Link>

      {/* 시뮬레이터 링크 */}
      <Link
        href={`/kids/${accountId}/simulator`}
        className="block mt-3 rounded-[16px] border border-border bg-card p-5 text-center
          hover:bg-card-hover hover:border-border-hover transition-all"
      >
        <span className="text-[24px]">🔮</span>
        <div className="text-[14px] font-bold text-bright mt-2">미래 시뮬레이터</div>
        <div className="text-[12px] text-sub mt-1">용돈을 넣으면 얼마나 자랄까?</div>
      </Link>
    </div>
  )
}
