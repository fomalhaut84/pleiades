'use client'

import { useState } from 'react'
import Card from '@/components/ui/Card'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface BacktestTrade {
  type: 'BUY' | 'SELL'
  date: string
  price: number
  shares: number
  reason: string
  pnl?: number
}

interface BacktestResult {
  ticker: string
  strategyName: string
  period: string
  trades: BacktestTrade[]
  metrics: {
    totalReturn: number
    annualizedReturn: number
    maxDrawdown: number
    sharpeRatio: number
    winRate: number
    profitFactor: number
    totalTrades: number
    avgHoldDays: number
  }
  benchmarkReturn: number
  equityCurve: { date: string; value: number }[]
  currency?: string
}

const STRATEGIES = [
  { key: 'rsi', label: 'RSI 반전', desc: 'RSI 30 이하 매수, 70 이상 매도' },
  { key: 'golden_cross', label: '골든크로스', desc: 'SMA50+200 위 매수, SMA50 아래 매도' },
  { key: 'bb', label: 'BB 반등', desc: 'BB 하단 매수, 상단 매도' },
  { key: 'sma', label: 'SMA 추세', desc: '가격 > SMA20 매수, < SMA20 매도' },
]

const PERIODS = [
  { days: 90, label: '3개월' },
  { days: 180, label: '6개월' },
  { days: 365, label: '1년' },
  { days: 730, label: '2년' },
  { days: 1095, label: '3년' },
]

function formatPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
}

function formatAmount(n: number, currency: string): string {
  if (currency === 'USD') {
    return `$${n >= 0 ? '' : '-'}${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  }
  if (Math.abs(n) >= 1_0000_0000) return `${(n / 1_0000_0000).toFixed(1)}억원`
  if (Math.abs(n) >= 1_0000) return `${Math.round(n / 1_0000).toLocaleString('ko-KR')}만원`
  return `${Math.round(n).toLocaleString('ko-KR')}원`
}

export default function BacktestClient() {
  const [ticker, setTicker] = useState('AAPL')
  const [strategyKey, setStrategyKey] = useState('rsi')
  const [days, setDays] = useState(365)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleRun = async () => {
    if (!ticker.trim() || loading) return
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: ticker.trim().toUpperCase(), strategyKey, days }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '백테스트 실패')
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류')
    } finally {
      setLoading(false)
    }
  }

  const cur = result?.currency ?? 'KRW'
  const isUSD = cur === 'USD'

  const chartData = result?.equityCurve.map((p) => ({
    date: p.date.slice(5),
    자산: isUSD ? Math.round(p.value) : Math.round(p.value / 10000),
  })) ?? []

  return (
    <div className="px-4 sm:px-8 py-6 max-w-[1200px] mx-auto">
      {/* 설정 */}
      <Card className="mb-6">
        <div className="text-[13px] font-bold text-bright mb-4">🧪 백테스트 설정</div>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="text-[11px] text-sub block mb-1">종목</label>
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              placeholder="AAPL"
              className="bg-surface border border-border rounded-lg px-3 py-2 text-[13px] text-text w-24"
            />
          </div>
          <div>
            <label className="text-[11px] text-sub block mb-1">전략</label>
            <select
              value={strategyKey}
              onChange={(e) => setStrategyKey(e.target.value)}
              className="bg-surface border border-border rounded-lg px-3 py-2 text-[13px] text-text"
            >
              {STRATEGIES.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-sub block mb-1">기간</label>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="bg-surface border border-border rounded-lg px-3 py-2 text-[13px] text-text"
            >
              {PERIODS.map((p) => (
                <option key={p.days} value={p.days}>{p.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleRun}
            disabled={loading}
            className="px-5 py-2 bg-sejin/15 text-sejin border border-sejin/20
              rounded-lg text-[13px] font-semibold hover:bg-sejin/25 disabled:opacity-30 transition-all"
          >
            {loading ? '실행 중...' : '실행'}
          </button>
        </div>
        <div className="text-[11px] text-dim mt-2">
          {STRATEGIES.find((s) => s.key === strategyKey)?.desc}
          {' · '}초기 자본 (USD: $10,000 / KRW: 1,000만원) · 수수료 0.25%
        </div>
      </Card>

      {error && (
        <Card className="mb-6">
          <div className="text-[13px] text-red-400">⚠️ {error}</div>
        </Card>
      )}

      {result && (
        <>
          {/* 메트릭 카드 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <Card>
              <div className="text-[11px] text-sub">총 수익률</div>
              <div className={`text-[20px] font-bold ${result.metrics.totalReturn >= 0 ? 'text-sejin' : 'text-red-400'}`}>
                {formatPct(result.metrics.totalReturn)}
              </div>
              <div className="text-[11px] text-dim">벤치 {formatPct(result.benchmarkReturn)}</div>
            </Card>
            <Card>
              <div className="text-[11px] text-sub">최대 낙폭</div>
              <div className="text-[20px] font-bold text-red-400">
                {formatPct(-result.metrics.maxDrawdown)}
              </div>
            </Card>
            <Card>
              <div className="text-[11px] text-sub">승률</div>
              <div className="text-[20px] font-bold text-bright">
                {result.metrics.winRate.toFixed(0)}%
              </div>
              <div className="text-[11px] text-dim">{result.metrics.totalTrades}회 거래</div>
            </Card>
            <Card>
              <div className="text-[11px] text-sub">샤프 비율</div>
              <div className="text-[20px] font-bold text-bright">
                {result.metrics.sharpeRatio.toFixed(2)}
              </div>
            </Card>
          </div>

          {/* 자산 곡선 차트 */}
          <Card className="mb-6">
            <div className="text-[13px] font-bold text-bright mb-4">
              📈 자산 곡선 ({result.ticker} · {result.strategyName})
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" tick={{ fill: '#9494a8', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#9494a8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => isUSD ? `$${v}` : `${v}만`} />
                <Tooltip
                  formatter={(val) => [isUSD ? `$${Number(val).toLocaleString()}` : `${Number(val).toLocaleString('ko-KR')}만원`, '자산']}
                  contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                />
                <Line type="monotone" dataKey="자산" stroke="#34d399" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* 거래 내역 */}
          {result.trades.length > 0 && (
            <Card>
              <div className="text-[13px] font-bold text-bright mb-4">
                📋 거래 내역 ({result.trades.length}건)
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-sub border-b border-border">
                      <th className="text-left py-2 px-2">날짜</th>
                      <th className="text-left py-2 px-2">유형</th>
                      <th className="text-right py-2 px-2">가격</th>
                      <th className="text-right py-2 px-2">수량</th>
                      <th className="text-right py-2 px-2">손익</th>
                      <th className="text-left py-2 px-2">사유</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.trades.map((t, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-2 px-2 text-text">{t.date}</td>
                        <td className="py-2 px-2">
                          <span className={t.type === 'BUY' ? 'text-sejin' : 'text-red-400'}>
                            {t.type === 'BUY' ? '📥 매수' : '📤 매도'}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right text-text">{t.price.toFixed(2)}</td>
                        <td className="py-2 px-2 text-right text-text">{t.shares}</td>
                        <td className={`py-2 px-2 text-right ${(t.pnl ?? 0) >= 0 ? 'text-sejin' : 'text-red-400'}`}>
                          {t.pnl != null ? formatAmount(t.pnl, cur) : '-'}
                        </td>
                        <td className="py-2 px-2 text-dim">{t.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
