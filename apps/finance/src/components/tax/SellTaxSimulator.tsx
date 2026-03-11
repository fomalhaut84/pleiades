'use client'

import { useState, useMemo } from 'react'
import { formatKRW, formatUSD } from '@/lib/format'
import { simulateSellTax } from '@/lib/tax/sell-simulator'
import {
  FOREIGN_STOCK_DEDUCTION,
  FOREIGN_STOCK_TAX_RATE,
  KR_ETF_TAX_RATE,
} from '@/lib/tax/capital-gains-tax'

interface HoldingOption {
  id: string
  accountName: string
  ticker: string
  displayName: string
  market: string
  currency: string
  shares: number
  avgPrice: number
  avgPriceFx: number | null
  avgFxRate: number | null
  currentPrice: number | null
  currentFxRate: number | null
}

interface SellTaxSimulatorProps {
  holdings: HoldingOption[]
  ytdForeignGain: number
}

export default function SellTaxSimulator({ holdings, ytdForeignGain }: SellTaxSimulatorProps) {
  const [selectedId, setSelectedId] = useState('')
  const [sellShares, setSellShares] = useState('')
  const [sellPrice, setSellPrice] = useState('')
  const [sellFxRate, setSellFxRate] = useState('')

  const selected = holdings.find((h) => h.id === selectedId) ?? null

  // 종목 선택 시 현재가/환율 자동 세팅
  const handleSelect = (id: string) => {
    setSelectedId(id)
    setSellShares('')
    const h = holdings.find((x) => x.id === id)
    if (h) {
      setSellPrice(h.currentPrice != null ? String(h.currentPrice) : '')
      setSellFxRate(h.currentFxRate != null ? String(h.currentFxRate) : '')
    }
  }

  const rawShares = Number(sellShares)
  const parsedShares = Number.isInteger(rawShares) && rawShares > 0 ? rawShares : 0
  const parsedPrice = parseFloat(sellPrice) || 0
  const parsedFxRate = parseFloat(sellFxRate) || 0

  const isValid = selected != null
    && parsedShares > 0
    && parsedShares <= selected.shares
    && parsedPrice > 0
    && (selected.currency !== 'USD' || parsedFxRate > 0)

  const result = useMemo(() => {
    if (!isValid || !selected) return null
    return simulateSellTax({
      market: selected.market,
      currency: selected.currency,
      sellShares: parsedShares,
      sellPrice: parsedPrice,
      sellFxRate: selected.currency === 'USD' ? parsedFxRate : null,
      avgPrice: selected.avgPrice,
      avgPriceFx: selected.avgPriceFx,
      avgFxRate: selected.avgFxRate,
      ytdForeignGain,
    })
  }, [isValid, selected, parsedShares, parsedPrice, parsedFxRate, ytdForeignGain])

  return (
    <div className="flex flex-col gap-4">
      {/* 입력 영역 */}
      <div className="relative overflow-hidden rounded-[14px] border border-border bg-card">
        <div className="px-5 py-3.5 border-b border-border">
          <div className="text-[13px] font-bold text-bright">매도 시뮬레이션</div>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          {/* 종목 선택 */}
          <div>
            <label className="text-[12px] text-sub mb-1.5 block">종목 선택</label>
            <select
              value={selectedId}
              onChange={(e) => handleSelect(e.target.value)}
              className="w-full bg-surface-dim border border-border rounded-lg px-3 py-2.5 text-[13px] text-bright outline-none focus:border-border-hover transition-colors"
            >
              <option value="">종목을 선택하세요</option>
              {holdings.map((h) => (
                <option key={h.id} value={h.id}>
                  [{h.accountName}] {h.displayName} ({h.ticker}) · {h.shares}주
                </option>
              ))}
            </select>
          </div>

          {selected && (
            <>
              {/* 보유 정보 요약 */}
              <div className="bg-card rounded-lg px-3 py-2.5 flex flex-col gap-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-dim">보유 수량</span>
                  <span className="text-muted tabular-nums">{selected.shares}주</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-dim">평균 매입단가</span>
                  <span className="text-muted tabular-nums">
                    {selected.currency === 'USD' && selected.avgPriceFx != null
                      ? formatUSD(selected.avgPriceFx)
                      : formatKRW(selected.avgPrice)}
                  </span>
                </div>
                {selected.currency === 'USD' && selected.avgFxRate != null && (
                  <div className="flex justify-between text-[11px]">
                    <span className="text-dim">매입 평균환율</span>
                    <span className="text-muted tabular-nums">{selected.avgFxRate.toFixed(2)}원</span>
                  </div>
                )}
                <div className="flex justify-between text-[11px]">
                  <span className="text-dim">시장 구분</span>
                  <span className="text-muted">
                    {selected.market === 'US' ? '해외주식' : '국내 ETF'} · 세율 {((selected.market === 'US' ? FOREIGN_STOCK_TAX_RATE : KR_ETF_TAX_RATE) * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* 매도 수량 */}
              <div>
                <label className="text-[12px] text-sub mb-1.5 block">
                  매도 수량
                  <span className="text-dim ml-1">(최대 {selected.shares}주)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={sellShares}
                    onChange={(e) => setSellShares(e.target.value)}
                    min={1}
                    max={selected.shares}
                    step={1}
                    placeholder="0"
                    className="flex-1 bg-surface-dim border border-border rounded-lg px-3 py-2.5 text-[13px] text-bright tabular-nums outline-none focus:border-border-hover transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setSellShares(String(selected.shares))}
                    className="px-3 py-2 text-[11px] font-semibold text-sub bg-surface-dim border border-border rounded-lg hover:bg-surface transition-colors"
                  >
                    전량
                  </button>
                </div>
                {parsedShares > selected.shares && (
                  <p className="text-[11px] text-red-400 mt-1">보유 수량을 초과할 수 없습니다</p>
                )}
              </div>

              {/* 매도 단가 */}
              <div>
                <label className="text-[12px] text-sub mb-1.5 block">
                  매도 단가 ({selected.currency})
                </label>
                <input
                  type="number"
                  value={sellPrice}
                  onChange={(e) => setSellPrice(e.target.value)}
                  min={0}
                  step={selected.currency === 'USD' ? 0.01 : 1}
                  placeholder={selected.currentPrice != null ? String(selected.currentPrice) : '0'}
                  className="w-full bg-surface-dim border border-border rounded-lg px-3 py-2.5 text-[13px] text-bright tabular-nums outline-none focus:border-border-hover transition-colors"
                />
              </div>

              {/* 환율 (USD only) */}
              {selected.currency === 'USD' && (
                <div>
                  <label className="text-[12px] text-sub mb-1.5 block">매도 환율 (₩/USD)</label>
                  <input
                    type="number"
                    value={sellFxRate}
                    onChange={(e) => setSellFxRate(e.target.value)}
                    min={0}
                    step={0.01}
                    placeholder={selected.currentFxRate != null ? String(selected.currentFxRate) : '0'}
                    className="w-full bg-surface-dim border border-border rounded-lg px-3 py-2.5 text-[13px] text-bright tabular-nums outline-none focus:border-border-hover transition-colors"
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 결과 영역 */}
      {result && (
        <div className="relative overflow-hidden rounded-[14px] border border-border bg-card">
          <div className="px-5 py-3.5 border-b border-border flex justify-between items-center">
            <div className="text-[13px] font-bold text-bright">예상 세금</div>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-surface-dim text-dim">
              시뮬레이션
            </span>
          </div>

          <div className="px-5 py-4 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-sub">매도 총액</span>
              <span className="text-[12px] text-muted tabular-nums">{formatKRW(result.proceedsKRW)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-sub">매입 원가</span>
              <span className="text-[12px] text-dim tabular-nums">{formatKRW(result.costBasisKRW)}</span>
            </div>
            <div className="h-px bg-surface-dim" />
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold text-sub">실현 손익</span>
              <span className={`text-[13px] font-semibold tabular-nums ${
                result.realizedGainKRW >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {result.realizedGainKRW >= 0 ? '+' : ''}{formatKRW(result.realizedGainKRW)}
              </span>
            </div>

            {/* USD 종목: 주가분/환율분 분리 */}
            {selected?.currency === 'USD' && result.priceGainKRW != null && result.fxGainKRW != null && (
              <div className="bg-card rounded-lg px-3 py-2 flex flex-col gap-1">
                <div className="flex justify-between text-[11px]">
                  <span className="text-dim">주가 변동분</span>
                  <span className={`tabular-nums ${result.priceGainKRW >= 0 ? 'text-green-400/70' : 'text-red-400/70'}`}>
                    {result.priceGainKRW >= 0 ? '+' : ''}{formatKRW(result.priceGainKRW)}
                  </span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-dim">환율 변동분</span>
                  <span className={`tabular-nums ${result.fxGainKRW >= 0 ? 'text-green-400/70' : 'text-red-400/70'}`}>
                    {result.fxGainKRW >= 0 ? '+' : ''}{formatKRW(result.fxGainKRW)}
                  </span>
                </div>
              </div>
            )}

            <div className="h-px bg-surface-dim" />

            {/* 해외주식: 공제 정보 */}
            {selected?.market === 'US' && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-sub">연간 공제 한도</span>
                  <span className="text-[12px] text-dim tabular-nums">{formatKRW(FOREIGN_STOCK_DEDUCTION)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-sub">기존 실현 손익 (YTD)</span>
                  <span className={`text-[12px] tabular-nums ${
                    ytdForeignGain >= 0 ? 'text-muted' : 'text-red-400/70'
                  }`}>
                    {ytdForeignGain >= 0 ? '+' : ''}{formatKRW(ytdForeignGain)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-sub">매도 후 공제 잔여</span>
                  <span className="text-[12px] text-muted tabular-nums">{formatKRW(result.deductionRemaining)}</span>
                </div>
              </>
            )}

            <div className="flex items-center justify-between">
              <span className="text-[12px] text-sub">과세 대상</span>
              <span className="text-[12px] text-muted tabular-nums">
                {formatKRW(result.taxableAmount)}
                <span className="text-dim ml-1">× {(result.taxRate * 100).toFixed(0)}%</span>
              </span>
            </div>

            <div className="h-px bg-surface" />
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold text-sub">예상 세금</span>
              <span className={`text-[17px] font-bold tabular-nums ${
                result.estimatedTax > 0 ? 'text-bright' : 'text-muted'
              }`}>
                {formatKRW(result.estimatedTax)}
              </span>
            </div>

            {result.realizedGainKRW > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-dim">세후 순이익 예상</span>
                <span className="text-[12px] text-muted tabular-nums">
                  {formatKRW(result.realizedGainKRW - result.estimatedTax)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 손실 시 안내 */}
      {result && result.realizedGainKRW < 0 && selected?.market === 'US' && (
        <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg px-4 py-2.5">
          <span className="text-[11px] text-blue-400/70">
            해외주식 간 손익통산이 가능합니다. 이 매도 손실은 같은 해 다른 해외주식 이익에서 공제할 수 있습니다.
          </span>
        </div>
      )}
    </div>
  )
}
