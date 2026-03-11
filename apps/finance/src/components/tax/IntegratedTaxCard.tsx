'use client'

import { useMemo } from 'react'
import { formatKRW } from '@/lib/format'
import { calcIntegratedTax } from '@/lib/tax/integrated-tax'

interface IntegratedTaxCardProps {
  /** 선택 연도 */
  year: number
  /** IncomeProfile 과세표준 (없으면 null) */
  baseTaxableIncome: number | null
  /** IncomeProfile 기납부 세액 */
  prepaidTax: number
  /** RSU 근로소득 합계 */
  rsuIncome: number
  /** 스톡옵션 행사 가능분 이익 (현재가 기준) */
  stockOptionGain: number
  /** 프로필 존재 여부 */
  hasProfile: boolean
  /** 주가 데이터 존재 여부 */
  hasPriceData: boolean
}

export default function IntegratedTaxCard({
  year,
  baseTaxableIncome,
  prepaidTax,
  rsuIncome,
  stockOptionGain,
  hasProfile,
  hasPriceData,
}: IntegratedTaxCardProps) {
  const result = useMemo(() => {
    if (baseTaxableIncome == null) return null
    return calcIntegratedTax({
      baseTaxableIncome,
      rsuIncome,
      stockOptionGain,
      prepaidTax,
    })
  }, [baseTaxableIncome, rsuIncome, stockOptionGain, prepaidTax])

  if (!hasProfile) {
    return (
      <div className="relative overflow-hidden rounded-[14px] border border-border bg-card p-6 text-center">
        <div className="text-[13px] text-sub mb-2">
          {year}년 근로소득 프로필이 없습니다
        </div>
        <p className="text-[11px] text-dim">
          하단의 근로소득 프로필에서 연봉 정보를 등록하면 통합 세금 시뮬레이션을 이용할 수 있습니다.
        </p>
      </div>
    )
  }

  if (!result) return null

  const hasAdditionalIncome = result.rsuIncome > 0 || result.stockOptionGain > 0

  return (
    <div className="flex flex-col gap-4">
      {/* 합산 내역 */}
      <div className="relative overflow-hidden rounded-[14px] border border-border bg-card">
        <div className="px-5 py-3.5 border-b border-border">
          <div className="text-[13px] font-bold text-bright">
            {year}년 근로소득 합산
          </div>
        </div>
        <div className="px-5 py-4 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-sub">연봉 과세표준</span>
            <span className="text-[12px] text-muted tabular-nums">
              {formatKRW(result.baseTaxableIncome)}
            </span>
          </div>

          {result.rsuIncome > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-sub">RSU 베스팅 소득</span>
              <span className="text-[12px] text-muted tabular-nums">
                +{formatKRW(result.rsuIncome)}
              </span>
            </div>
          )}

          {result.stockOptionGain > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] text-sub">스톡옵션 행사 이익</span>
                <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-yellow-500/10 text-yellow-400">
                  현재가 기준
                </span>
              </div>
              <span className="text-[12px] text-muted tabular-nums">
                +{formatKRW(result.stockOptionGain)}
              </span>
            </div>
          )}

          <div className="h-px bg-surface" />

          <div className="flex items-center justify-between">
            <span className="text-[13px] font-bold text-sub">합산 과세표준</span>
            <span className="text-[15px] font-bold text-bright tabular-nums">
              {formatKRW(result.combinedTaxable)}
            </span>
          </div>
        </div>
      </div>

      {/* 세금 계산 결과 */}
      <div className="relative overflow-hidden rounded-[14px] border border-border bg-card">
        <div className="px-5 py-3.5 border-b border-border">
          <div className="text-[13px] font-bold text-bright">세금 계산</div>
        </div>
        <div className="px-5 py-4 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-sub">소득세 (누진세율)</span>
            <span className="text-[12px] text-muted tabular-nums">
              {formatKRW(result.incomeTax)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-sub">지방소득세 (10%)</span>
            <span className="text-[12px] text-dim tabular-nums">
              {formatKRW(result.localTax)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-sub">총 세금</span>
            <div className="text-right">
              <span className="text-[14px] font-bold text-bright tabular-nums">
                {formatKRW(result.totalTax)}
              </span>
              <span className="text-[11px] text-dim ml-1.5">
                (실효 {(result.effectiveRate * 100).toFixed(1)}%)
              </span>
            </div>
          </div>

          <div className="h-px bg-surface-dim" />
          {result.prepaidTax > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-sub">기납부 세액</span>
              <span className="text-[12px] text-muted tabular-nums">
                -{formatKRW(result.prepaidTax)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-bold text-sub">
              {result.prepaidTax > 0
                ? (result.additionalTax >= 0 ? '추가 납부 예상' : '환급 예상')
                : '총 납부 예상'}
            </span>
            <span className={`text-[17px] font-bold tabular-nums ${
              result.prepaidTax > 0 && result.additionalTax < 0
                ? 'text-green-400'
                : 'text-bright'
            }`}>
              {result.prepaidTax > 0 && result.additionalTax < 0
                ? `-${formatKRW(Math.abs(result.additionalTax))}`
                : formatKRW(result.prepaidTax > 0 ? result.additionalTax : result.totalTax)}
            </span>
          </div>

          {/* 증분 세금 (연봉 대비 추가 부담) */}
          {hasAdditionalIncome && (
            <>
              <div className="h-px bg-surface-dim" />
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-sub">연봉만 기준 세금</span>
                <span className="text-[12px] text-dim tabular-nums">
                  {formatKRW(result.baseOnlyTax)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-sub">
                  RSU/스톡옵션으로 인한 증분 세금
                </span>
                <span className="text-[13px] font-bold text-yellow-400 tabular-nums">
                  +{formatKRW(result.incrementalTax)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 주가 데이터 없음 경고 (현재 연도만 의미 있음) */}
      {!hasPriceData && stockOptionGain === 0 && (
        <div className="bg-card border border-border rounded-lg px-3 py-2">
          <span className="text-[11px] text-dim">
            카카오 주가 데이터가 없어 스톡옵션 행사 이익이 미반영되었습니다. 주가 갱신 후 다시 확인하세요.
          </span>
        </div>
      )}

      {/* 안내 */}
      <div className="bg-yellow-500/5 border border-yellow-500/10 rounded-lg px-3 py-2">
        <span className="text-[11px] text-yellow-400/70">
          {result.stockOptionGain > 0
            ? '스톡옵션 행사 이익은 현재 주가 기준 예상치이며, 실제 행사 시점의 시가에 따라 달라집니다. '
            : ''}
          인적공제·특별공제 등이 미반영된 참고용 추정치입니다. 정확한 세금 계산은 세무사에게 문의하세요.
        </span>
      </div>
    </div>
  )
}
