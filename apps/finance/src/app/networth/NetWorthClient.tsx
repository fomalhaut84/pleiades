'use client'

import { useState, useEffect } from 'react'
import Card from '@/components/ui/Card'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from 'recharts'

interface Asset {
  id: string
  name: string
  category: string
  owner: string
  value: number
  isLiability: boolean
  interestRate: number | null
  note: string | null
}

interface Snapshot {
  date: string
  netWorthKRW: number
  stockValueKRW: number
  assetValueKRW: number
  liabilityKRW: number
}

interface NetWorthData {
  netWorthKRW: number
  stockValueKRW: number
  assetValueKRW: number
  liabilityKRW: number
  breakdown: Record<string, number>
  fxRate: number
  assets: Asset[]
  previousSnapshot: {
    date: string
    netWorthKRW: number
    change: number
    changePct: number
  } | null
  snapshots: Snapshot[]
}

const CATEGORY_LABELS: Record<string, string> = {
  stock: '📈 주식',
  savings: '💰 예적금',
  insurance: '🛡️ 보험',
  real_estate: '🏠 부동산',
  pension: '🏦 연금',
  cash: '💵 현금',
  other: '📦 기타',
}

const PIE_COLORS = ['#34d399', '#60a5fa', '#fb923c', '#8b5cf6', '#f472b6', '#fbbf24', '#6ee7b7']

function formatCompact(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_0000_0000) return `${sign}${(abs / 1_0000_0000).toFixed(1)}억`
  if (abs >= 1_0000) return `${sign}${Math.round(abs / 1_0000).toLocaleString('ko-KR')}만`
  return `${sign}${Math.round(abs).toLocaleString('ko-KR')}`
}

function formatFull(n: number): string {
  return `₩${Math.round(n).toLocaleString('ko-KR')}`
}

export default function NetWorthClient() {
  const [data, setData] = useState<NetWorthData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/networth')
      .then((r) => {
        if (!r.ok) throw new Error('API error')
        return r.json()
      })
      .then((d) => {
        if (d.breakdown) setData(d)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="p-8 text-center text-sub">로딩 중...</div>
  }

  if (!data) {
    return <div className="p-8 text-center text-sub">데이터를 불러올 수 없습니다.</div>
  }

  // 파이차트 데이터 (자산만, 부채 제외)
  const pieData = Object.entries(data.breakdown)
    .filter(([key]) => !key.startsWith('liability_'))
    .filter(([, val]) => val > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, val]) => ({
      name: CATEGORY_LABELS[key] ?? key,
      value: val,
    }))

  // 라인차트 데이터
  const chartData = data.snapshots.map((s) => ({
    month: new Date(s.date).toLocaleDateString('ko-KR', { month: 'short' }),
    순자산: Math.round(s.netWorthKRW / 10000),
  }))

  const assetItems = data.assets.filter((a) => !a.isLiability)
  const liabilityItems = data.assets.filter((a) => a.isLiability)

  return (
    <div className="px-4 sm:px-8 py-6 max-w-[1200px] mx-auto">
      {/* 순자산 총액 */}
      <Card glowColor="#34d399" className="mb-6">
        <div className="text-[12px] text-sub font-medium">💰 가족 순자산</div>
        <div className="text-[28px] font-extrabold text-bright mt-1">
          ₩{formatCompact(data.netWorthKRW)}
        </div>
        {data.previousSnapshot && (
          <div className={`text-[13px] mt-1 ${data.previousSnapshot.change >= 0 ? 'text-sejin' : 'text-red-400'}`}>
            전월 대비 {data.previousSnapshot.change >= 0 ? '+' : ''}₩{formatCompact(data.previousSnapshot.change)}
            {' '}({data.previousSnapshot.changePct >= 0 ? '+' : ''}{data.previousSnapshot.changePct.toFixed(1)}%)
          </div>
        )}
        <div className="flex gap-6 mt-4 text-[12px] text-sub">
          <span>📈 주식 ₩{formatCompact(data.stockValueKRW)}</span>
          <span>📦 비주식 ₩{formatCompact(data.assetValueKRW)}</span>
          {data.liabilityKRW > 0 && <span>🏦 부채 -₩{formatCompact(data.liabilityKRW)}</span>}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        {/* 파이차트 */}
        <Card>
          <div className="text-[13px] font-bold text-bright mb-4">📊 자산 구성</div>
          {pieData.length > 0 ? (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%" cy="50%"
                    innerRadius={40} outerRadius={70}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val) => formatFull(Number(val))}
                    contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-2">
                {pieData.map((item, i) => {
                  const total = pieData.reduce((s, d) => s + d.value, 0)
                  const pct = total > 0 ? ((item.value / total) * 100).toFixed(0) : '0'
                  return (
                    <div key={item.name} className="flex items-center gap-2 text-[12px]">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-sub">{item.name} {pct}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="text-sub text-[12px]">자산 데이터 없음</div>
          )}
        </Card>

        {/* 추이 차트 */}
        <Card>
          <div className="text-[13px] font-bold text-bright mb-4">📈 순자산 추이</div>
          {chartData.length > 1 ? (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="month" tick={{ fill: '#9494a8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#9494a8', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}만`} />
                <Tooltip
                  formatter={(val) => [`${Number(val).toLocaleString('ko-KR')}만원`, '순자산']}
                  contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                />
                <Line type="monotone" dataKey="순자산" stroke="#34d399" strokeWidth={2} dot={{ r: 3, fill: '#34d399' }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-sub text-[12px]">스냅샷 2개 이상 필요 (매월 1일 자동 저장)</div>
          )}
        </Card>
      </div>

      {/* 자산 목록 */}
      <Card className="mb-5">
        <div className="flex justify-between items-center mb-4">
          <div className="text-[13px] font-bold text-bright">📦 자산</div>
          <div className="text-[12px] text-sub">
            합계 ₩{formatCompact(data.stockValueKRW + data.assetValueKRW)}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {/* 주식 포트폴리오 (자동) */}
          <div className="flex justify-between items-center px-4 py-3 bg-surface-dim rounded-[10px]">
            <div>
              <div className="text-[13px] text-text">📈 주식 포트폴리오</div>
              <div className="text-[11px] text-dim">자동 계산 · 3계좌</div>
            </div>
            <div className="text-[13px] font-semibold text-bright text-right">
              ₩{formatCompact(data.stockValueKRW)}
            </div>
          </div>
          {assetItems.map((a) => (
            <div key={a.id} className="flex justify-between items-center px-4 py-3 bg-surface-dim rounded-[10px]">
              <div>
                <div className="text-[13px] text-text">
                  {CATEGORY_LABELS[a.category]?.slice(0, 2) ?? '📦'} {a.name}
                </div>
                <div className="text-[11px] text-dim">
                  {CATEGORY_LABELS[a.category]?.slice(2).trim() ?? a.category}
                  {a.owner !== '공동' ? ` · ${a.owner}` : ''}
                </div>
              </div>
              <div className="text-[13px] font-semibold text-bright text-right">
                ₩{formatCompact(a.value)}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 부채 */}
      {liabilityItems.length > 0 && (
        <Card>
          <div className="flex justify-between items-center mb-4">
            <div className="text-[13px] font-bold text-bright">🏦 부채</div>
            <div className="text-[12px] text-sub">
              합계 -₩{formatCompact(data.liabilityKRW)}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {liabilityItems.map((a) => (
              <div key={a.id} className="flex justify-between items-center px-4 py-3 bg-surface-dim rounded-[10px]">
                <div>
                  <div className="text-[13px] text-text">🏦 {a.name}</div>
                  <div className="text-[11px] text-dim">
                    대출{a.interestRate != null ? ` · ${a.interestRate}%` : ''}
                    {a.owner !== '공동' ? ` · ${a.owner}` : ''}
                  </div>
                </div>
                <div className="text-[13px] font-semibold text-red-400 text-right">
                  -₩{formatCompact(a.value)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
