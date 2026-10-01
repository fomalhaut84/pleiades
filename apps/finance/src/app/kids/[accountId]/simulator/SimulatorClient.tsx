'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { simulateCompoundGrowth } from '@/lib/simulator/compound-engine'

interface Props {
  accountId: string
  accountName: string
  ownerAge: number | null
  currentValue: number
  yearsToAdult: number
}

const ACCOUNT_EMOJI: Record<string, string> = { '소담': '👧', '다솜': '👶' }

const MONTHLY_OPTIONS = [
  { value: 10000, label: '1만원' },
  { value: 20000, label: '2만원' },
  { value: 50000, label: '5만원' },
  { value: 100000, label: '10만원' },
  { value: 200000, label: '20만원' },
  { value: 500000, label: '50만원' },
]

function formatKRW(n: number): string {
  if (n >= 1_0000_0000) return `약 ${(n / 1_0000_0000).toFixed(1)}억원`
  if (n >= 1_0000) return `약 ${Math.round(n / 1_0000).toLocaleString('ko-KR')}만원`
  return `${Math.round(n).toLocaleString('ko-KR')}원`
}

export default function SimulatorClient({
  accountId, accountName, ownerAge, currentValue, yearsToAdult,
}: Props) {
  const [monthly, setMonthly] = useState(50000)
  const emoji = ACCOUNT_EMOJI[accountName] ?? '👤'

  const result = useMemo(() => {
    return simulateCompoundGrowth({
      initialValue: currentValue,
      monthlyContribution: monthly,
      years: yearsToAdult,
      annualReturn: 0.08,
    })
  }, [currentValue, monthly, yearsToAdult])

  // 차트 데이터 (연 단위)
  const chartData = result.dataPoints
    .filter((d) => d.month % 12 === 0)
    .map((d) => ({
      age: ownerAge != null ? ownerAge + d.month / 12 : d.month / 12,
      label: ownerAge != null ? `${ownerAge + d.month / 12}세` : `${d.month / 12}년`,
      투자금: Math.round(d.totalContributed / 10000),
      총자산: Math.round(d.value / 10000),
    }))

  const growthAmount = result.finalValue - result.totalContributed

  return (
    <div className="min-h-screen px-4 sm:px-8 py-8 max-w-[600px] mx-auto">
      {/* 헤더 */}
      <div className="text-center mb-6">
        <h1 className="text-[24px] font-extrabold text-bright">
          🔮 {accountName}이의 미래 보기
        </h1>
        <p className="text-[13px] text-sub mt-1">
          {emoji} 매달 용돈을 넣으면 얼마나 자랄까?
        </p>
        <Link
          href={`/kids/${accountId}`}
          className="inline-block mt-2 text-[12px] text-sodam hover:text-sodam/80 transition-colors"
        >
          ← 대시보드로 돌아가기
        </Link>
      </div>

      {/* 용돈 선택 */}
      <div className="rounded-[16px] border border-border bg-card p-5 mb-6">
        <div className="text-[14px] font-bold text-bright mb-3">💰 매달 얼마를 넣을까?</div>
        <div className="grid grid-cols-3 gap-2">
          {MONTHLY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setMonthly(opt.value)}
              className={`py-3 rounded-xl text-[14px] font-semibold transition-all
                ${monthly === opt.value
                  ? 'bg-sodam/20 text-sodam border border-sodam/30'
                  : 'bg-surface-dim text-sub border border-border hover:bg-surface'
                }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 결과 카드 */}
      <div className="rounded-[20px] border border-sejin/20 bg-sejin/5 p-6 text-center mb-6">
        <div className="text-[14px] text-sejin">
          매달 {(monthly / 10000).toFixed(0)}만원씩 {yearsToAdult}년 넣으면
        </div>
        <div className="text-[32px] font-extrabold text-bright mt-2">
          {formatKRW(result.finalValue)} ✨
        </div>
        <div className="flex justify-center gap-6 mt-3 text-[12px]">
          <div>
            <div className="text-sub">넣은 돈</div>
            <div className="text-bright font-semibold">{formatKRW(result.totalContributed)}</div>
          </div>
          <div>
            <div className="text-sub">불어난 돈</div>
            <div className="text-sejin font-semibold">+{formatKRW(growthAmount)}</div>
          </div>
        </div>
        <div className="text-[11px] text-dim mt-3">
          연 8% 수익률 기준 · 실제와 다를 수 있어요
        </div>
      </div>

      {/* 성장 차트 */}
      <div className="rounded-[16px] border border-border bg-card p-5 mb-6">
        <div className="text-[14px] font-bold text-bright mb-4">📈 자산이 자라는 모습</div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="label" tick={{ fill: '#9494a8', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#9494a8', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}만`} />
            <Tooltip
              formatter={(val) => [`${Number(val).toLocaleString('ko-KR')}만원`]}
              contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
            />
            <Area type="monotone" dataKey="투자금" stackId="1" stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.3} />
            <Area type="monotone" dataKey="총자산" stroke="#34d399" fill="#34d399" fillOpacity={0.15} />
          </AreaChart>
        </ResponsiveContainer>
        <div className="flex justify-center gap-6 mt-2 text-[11px]">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-sodam/40" /> 넣은 돈
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-sejin/40" /> 총 자산
          </div>
        </div>
      </div>

      {/* 교육 메시지 */}
      <div className="rounded-[16px] border border-border bg-card p-5 text-center">
        <span className="text-[32px]">🌱</span>
        <div className="text-[14px] font-bold text-bright mt-2">복리의 마법!</div>
        <div className="text-[12px] text-sub mt-2 leading-relaxed">
          돈을 넣고 가만히 두면, 번 돈이 또 돈을 벌어줘요.<br />
          시간이 오래 지날수록 눈덩이처럼 커져요! ⛄<br />
          그래서 일찍 시작할수록 좋아요.
        </div>
      </div>
    </div>
  )
}
