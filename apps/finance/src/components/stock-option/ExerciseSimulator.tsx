'use client'

import { useState, useMemo } from 'react'
import { formatKRW } from '@/lib/format'
import { simulateExercise, calcIncomeTaxOnExercise } from '@/lib/stock-option-utils'
import type { StockOptionWithVestings } from '@/lib/stock-option-utils'

interface ExerciseSimulatorProps {
  stockOptions: StockOptionWithVestings[]
  currentPrice: number
}

export default function ExerciseSimulator({ stockOptions, currentPrice }: ExerciseSimulatorProps) {
  const [targetPrice, setTargetPrice] = useState(String(currentPrice))

  const parsedPrice = Number(targetPrice) || 0

  const result = useMemo(() => {
    if (parsedPrice <= 0) return null
    return simulateExercise(stockOptions, parsedPrice)
  }, [stockOptions, parsedPrice])

  const taxEstimate = useMemo(() => {
    if (!result || result.totalGain <= 0) return null
    return calcIncomeTaxOnExercise(result.totalGain)
  }, [result])

  return (
    <div className="flex flex-col gap-4">
      {/* 입력 */}
      <div className="relative overflow-hidden rounded-[14px] border border-border bg-card">
        <div className="px-5 py-3.5 border-b border-border">
          <div className="text-[13px] font-bold text-bright">행사 시뮬레이터</div>
        </div>
        <div className="px-5 py-4">
          <label className="text-[12px] text-sub mb-1.5 block">목표 주가 (원)</label>
          <input
            type="number"
            value={targetPrice}
            onChange={(e) => setTargetPrice(e.target.value)}
            min={0}
            step={1000}
            className="w-full bg-surface-dim border border-border rounded-lg px-3 py-2.5 text-[13px] text-bright tabular-nums outline-none focus:border-border-hover transition-colors"
          />
          <div className="mt-2 flex gap-2">
            {[0.8, 1.0, 1.2, 1.5, 2.0].map((mult) => (
              <button
                key={mult}
                type="button"
                onClick={() => setTargetPrice(String(Math.round(currentPrice * mult)))}
                className={`px-2 py-1 text-[10px] font-semibold rounded border transition-colors ${
                  Math.round(currentPrice * mult) === parsedPrice
                    ? 'bg-surface border-border-hover text-bright'
                    : 'bg-card border-border text-dim hover:text-sub'
                }`}
              >
                {mult === 1.0 ? '현재가' : `×${mult}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 결과 */}
      {result && result.gains.length > 0 && (
        <div className="relative overflow-hidden rounded-[14px] border border-border bg-card">
          <div className="px-5 py-3.5 border-b border-border flex justify-between items-center">
            <div className="text-[13px] font-bold text-bright">행사 시 예상 이익</div>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-surface-dim text-dim">
              행사 가능분만
            </span>
          </div>

          <div className="px-5 py-4 flex flex-col gap-2.5">
            {result.gains.map((g) => (
              <div key={g.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-sub">행사가 {formatKRW(g.strikePrice)}</span>
                  <span className="text-[11px] text-dim">{g.shares}주</span>
                </div>
                <span className={`text-[13px] font-semibold tabular-nums ${
                  g.inTheMoney ? 'text-green-400' : 'text-dim'
                }`}>
                  {g.inTheMoney ? formatKRW(g.gain) : 'OTM'}
                </span>
              </div>
            ))}

            <div className="h-px bg-surface" />

            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold text-sub">행사 이익 합계</span>
              <span className={`text-[17px] font-bold tabular-nums ${
                result.totalGain > 0 ? 'text-green-400' : 'text-dim'
              }`}>
                {formatKRW(result.totalGain)}
              </span>
            </div>

            {/* 세금 추정 */}
            {taxEstimate && (
              <>
                <div className="h-px bg-surface-dim" />
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-sub">예상 소득세 (근로소득)</span>
                  <span className="text-[12px] text-muted tabular-nums">{formatKRW(taxEstimate.incomeTax)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-sub">예상 지방소득세</span>
                  <span className="text-[12px] text-dim tabular-nums">{formatKRW(taxEstimate.localTax)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-sub">예상 세금 합계</span>
                  <span className="text-[14px] font-bold text-bright tabular-nums">{formatKRW(taxEstimate.totalTax)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-sub">세후 순이익</span>
                  <span className="text-[13px] font-semibold text-green-400 tabular-nums">
                    {formatKRW(result.totalGain - taxEstimate.totalTax)}
                  </span>
                </div>

                <div className="mt-1 bg-yellow-500/5 border border-yellow-500/10 rounded-lg px-3 py-2">
                  <span className="text-[11px] text-yellow-400/70">
                    행사 이익만 기준 추정입니다. 기존 연봉 합산 시 세율이 높아질 수 있습니다.
                    정확한 계산은 근로소득 프로필 등록 후 통합 세금 시뮬레이션을 이용하세요.
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 전부 OTM인 경우 */}
      {result && result.totalGain === 0 && parsedPrice > 0 && (
        <div className="relative overflow-hidden rounded-[14px] border border-border bg-card p-8 text-center">
          <div className="text-[13px] text-sub">
            목표 주가 {formatKRW(parsedPrice)}에서는 행사 가능한 내가치가 없습니다
          </div>
        </div>
      )}
    </div>
  )
}
