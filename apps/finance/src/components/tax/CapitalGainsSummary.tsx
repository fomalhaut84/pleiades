'use client'

import { formatKRW } from '@/lib/format'
import {
  FOREIGN_STOCK_DEDUCTION,
  FOREIGN_STOCK_TAX_RATE,
  KR_ETF_TAX_RATE,
} from '@/lib/tax/capital-gains-tax'

interface CapitalGainsSummaryProps {
  year: number
  foreignStockGain: number
  foreignStockTaxable: number
  foreignStockTax: number
  krEtfGain: number
  krEtfTax: number
  totalEstimatedTax: number
  hasSales: boolean
}

export default function CapitalGainsSummary({
  year,
  foreignStockGain,
  foreignStockTaxable,
  foreignStockTax,
  krEtfGain,
  krEtfTax,
  totalEstimatedTax,
  hasSales,
}: CapitalGainsSummaryProps) {
  if (!hasSales) {
    return (
      <div className="relative overflow-hidden rounded-[14px] border border-border bg-card p-8 text-center">
        <div className="text-[13px] text-sub">{year}년 매도 거래가 없습니다</div>
      </div>
    )
  }

  const hasForeign = foreignStockGain !== 0
  const hasKrEtf = krEtfGain > 0

  return (
    <div className="flex flex-col gap-4">
      {/* 해외주식 */}
      {hasForeign && (
        <div className="relative overflow-hidden rounded-[14px] border border-border bg-card">
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[13px] font-bold text-bright">해외주식 양도소득세</h3>
              <span className="text-[11px] text-dim px-1.5 py-0.5 rounded bg-white/[0.04]">
                {(FOREIGN_STOCK_TAX_RATE * 100).toFixed(0)}%
              </span>
            </div>

            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-sub">실현 손익</span>
                <span className={`text-[13px] font-semibold tabular-nums ${
                  foreignStockGain >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {foreignStockGain >= 0 ? '+' : ''}{formatKRW(foreignStockGain)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-sub">기본공제</span>
                <span className="text-[12px] text-dim tabular-nums">-{formatKRW(FOREIGN_STOCK_DEDUCTION)}</span>
              </div>
              <div className="h-px bg-white/[0.04]" />
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-sub">과세 대상</span>
                <span className="text-[13px] font-semibold text-muted tabular-nums">
                  {formatKRW(foreignStockTaxable)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-sub">예상 세금</span>
                <span className="text-[14px] font-bold text-bright tabular-nums">
                  {formatKRW(foreignStockTax)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 국내 ETF */}
      {hasKrEtf && (
        <div className="relative overflow-hidden rounded-[14px] border border-border bg-card">
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[13px] font-bold text-bright">국내 ETF 배당소득세</h3>
              <span className="text-[11px] text-dim px-1.5 py-0.5 rounded bg-white/[0.04]">
                {(KR_ETF_TAX_RATE * 100).toFixed(1)}%
              </span>
            </div>

            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-sub">매매 차익</span>
                <span className="text-[13px] font-semibold text-green-400 tabular-nums">
                  +{formatKRW(krEtfGain)}
                </span>
              </div>
              <div className="h-px bg-white/[0.04]" />
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-sub">예상 세금</span>
                <span className="text-[14px] font-bold text-bright tabular-nums">
                  {formatKRW(krEtfTax)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 합계 */}
      {(hasForeign || hasKrEtf) && totalEstimatedTax > 0 && (
        <div className="relative overflow-hidden rounded-[14px] border border-white/[0.08] bg-white/[0.02] px-5 py-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-bold text-sub">{year}년 예상 양도세 합계</span>
            <span className="text-[17px] font-bold text-bright tabular-nums">
              {formatKRW(totalEstimatedTax)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
