'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Card from '@/components/ui/Card'
import { calcDividendTax, calcAmountKRW } from '@/lib/dividend-utils'

interface Account {
  id: string
  name: string
  holdings: {
    ticker: string
    displayName: string
    market: string
    currency: string
  }[]
}

interface DividendFormProps {
  accounts: Account[]
}

const ACCOUNT_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  '세진': { border: 'border-sejin', bg: 'bg-sejin/10', text: 'text-sejin' },
  '소담': { border: 'border-sodam', bg: 'bg-sodam/10', text: 'text-sodam' },
  '다솜': { border: 'border-dasom', bg: 'bg-dasom/10', text: 'text-dasom' },
}

export default function DividendForm({ accounts }: DividendFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [accountId, setAccountId] = useState('')
  const [selectedTicker, setSelectedTicker] = useState('')
  const [manualTicker, setManualTicker] = useState('')
  const [manualDisplayName, setManualDisplayName] = useState('')
  const [manualCurrency, setManualCurrency] = useState<'USD' | 'KRW'>('KRW')
  const [tickerMode, setTickerMode] = useState<'select' | 'manual'>('select')
  const [exDate, setExDate] = useState('')
  const [payDate, setPayDate] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })
  const [amountGross, setAmountGross] = useState('')
  const [amountNet, setAmountNet] = useState('')
  const [taxAmount, setTaxAmount] = useState('')
  const [fxRate, setFxRate] = useState('')
  const [reinvested, setReinvested] = useState(false)

  const selectedAccount = accounts.find((a) => a.id === accountId)
  const holdings = useMemo(
    () => selectedAccount?.holdings ?? [],
    [selectedAccount]
  )

  const selectedHolding = useMemo(() => {
    if (tickerMode === 'select' && selectedTicker) {
      return holdings.find((h) => h.ticker === selectedTicker)
    }
    return null
  }, [tickerMode, selectedTicker, holdings])

  const currency = tickerMode === 'select'
    ? (selectedHolding?.currency ?? 'KRW')
    : manualCurrency
  const isUSD = currency === 'USD'

  // Fetch FX rate
  useEffect(() => {
    if (!isUSD) return
    fetch('/api/prices')
      .then((r) => r.json())
      .then((data) => {
        const fx = data.prices?.find((p: { ticker: string }) => p.ticker === 'USDKRW=X')
        if (fx) setFxRate(String(Math.round(fx.price)))
      })
      .catch(() => {})
  }, [isUSD])

  // Reset ticker when account changes
  useEffect(() => {
    setSelectedTicker('')
    const acct = accounts.find((a) => a.id === accountId)
    setTickerMode(acct && acct.holdings.length > 0 ? 'select' : 'manual')
  }, [accountId, accounts])

  // Auto-calculate tax when gross amount changes
  useEffect(() => {
    const gross = parseFloat(amountGross)
    if (!Number.isFinite(gross) || gross <= 0) return
    const result = calcDividendTax(gross, currency)
    setTaxAmount(String(result.taxAmount))
    setAmountNet(String(result.amountNet))
  }, [amountGross, currency])

  const parsedGross = parseFloat(amountGross) || 0
  const parsedNet = parseFloat(amountNet) || 0
  const parsedFxRate = parseFloat(fxRate) || 0
  const amountKRW = calcAmountKRW(parsedNet, currency, parsedFxRate)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const ticker = tickerMode === 'select' ? selectedTicker : manualTicker.toUpperCase().trim()
    const displayName = tickerMode === 'select'
      ? (selectedHolding?.displayName ?? ticker)
      : manualDisplayName

    try {
      const res = await fetch('/api/dividends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          ticker,
          displayName,
          exDate: exDate || undefined,
          payDate,
          amountGross: parsedGross,
          amountNet: parsedNet,
          taxAmount: parseFloat(taxAmount) || 0,
          currency,
          fxRate: isUSD ? parsedFxRate : null,
          amountKRW,
          reinvested,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? '배당 기록에 실패했습니다.')
        return
      }

      router.push('/dividends')
      router.refresh()
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputClasses = 'w-full bg-surface-dim border border-border rounded-lg px-3.5 py-2.5 text-[13px] text-bright placeholder-dim focus:outline-none focus:bg-surface focus:border-border-hover transition-colors'
  const labelClasses = 'block text-[12px] font-semibold text-sub mb-1.5'

  return (
    <Card className="max-w-[560px] mx-auto">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* 계좌 선택 */}
        <div>
          <label className={labelClasses}>계좌</label>
          <div className="grid grid-cols-3 gap-2">
            {accounts.map((account) => {
              const colors = ACCOUNT_COLORS[account.name]
              const isActive = accountId === account.id
              return (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => setAccountId(account.id)}
                  className={`py-2.5 rounded-lg text-[13px] font-semibold border transition-all ${
                    isActive
                      ? `${colors?.bg} ${colors?.border} ${colors?.text}`
                      : 'border-border text-sub hover:bg-surface-dim hover:text-muted'
                  }`}
                >
                  {account.name}
                </button>
              )
            })}
          </div>
        </div>

        {/* 종목 선택 */}
        <div>
          <label className={labelClasses}>종목</label>
          {accountId && holdings.length > 0 ? (
            <select
              value={tickerMode === 'select' ? selectedTicker : '__manual__'}
              onChange={(e) => {
                if (e.target.value === '__manual__') {
                  setTickerMode('manual')
                  setSelectedTicker('')
                } else {
                  setTickerMode('select')
                  setSelectedTicker(e.target.value)
                }
              }}
              className={inputClasses}
            >
              <option value="">종목을 선택하세요</option>
              {holdings.map((h) => (
                <option key={h.ticker} value={h.ticker}>
                  {h.displayName} ({h.ticker})
                </option>
              ))}
              <option value="__manual__">직접 입력</option>
            </select>
          ) : null}

          {tickerMode === 'manual' && accountId && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className={labelClasses}>티커</label>
                <input
                  type="text"
                  value={manualTicker}
                  onChange={(e) => setManualTicker(e.target.value)}
                  placeholder="AAPL"
                  className={inputClasses}
                />
              </div>
              <div>
                <label className={labelClasses}>종목명</label>
                <input
                  type="text"
                  value={manualDisplayName}
                  onChange={(e) => setManualDisplayName(e.target.value)}
                  placeholder="애플"
                  className={inputClasses}
                />
              </div>
              <div>
                <label className={labelClasses}>통화</label>
                <div className="grid grid-cols-2 gap-0 rounded-lg border border-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setManualCurrency('KRW')}
                    className={`py-2 text-[12px] font-bold transition-all ${
                      manualCurrency === 'KRW'
                        ? 'bg-amber-400/15 text-amber-400'
                        : 'text-sub hover:bg-surface-dim'
                    }`}
                  >
                    KRW
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualCurrency('USD')}
                    className={`py-2 text-[12px] font-bold border-l border-border transition-all ${
                      manualCurrency === 'USD'
                        ? 'bg-sodam/15 text-sodam'
                        : 'text-sub hover:bg-surface-dim'
                    }`}
                  >
                    USD
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 날짜 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClasses}>배당 기준일 (선택)</label>
            <input
              type="date"
              value={exDate}
              onChange={(e) => setExDate(e.target.value)}
              className={inputClasses}
            />
          </div>
          <div>
            <label className={labelClasses}>지급일</label>
            <input
              type="date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
              className={inputClasses}
            />
          </div>
        </div>

        {/* 세전 금액 */}
        <div>
          <label className={labelClasses}>세전 배당금</label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[12px] text-dim">
              {isUSD ? '$' : '₩'}
            </span>
            <input
              type="number"
              value={amountGross}
              onChange={(e) => setAmountGross(e.target.value)}
              placeholder="0"
              min="0"
              step={isUSD ? '0.01' : '1'}
              className={`${inputClasses} pl-8`}
            />
          </div>
        </div>

        {/* 세금 + 세후 (자동 계산, 수정 가능) */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClasses}>
              원천징수 세금
              <span className="text-dim ml-1 font-normal">
                ({isUSD ? '15%' : '15.4%'})
              </span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[12px] text-dim">
                {isUSD ? '$' : '₩'}
              </span>
              <input
                type="number"
                value={taxAmount}
                onChange={(e) => {
                  setTaxAmount(e.target.value)
                  const tax = parseFloat(e.target.value) || 0
                  setAmountNet(String(
                    isUSD
                      ? Math.round((parsedGross - tax) * 100) / 100
                      : Math.round(parsedGross - tax)
                  ))
                }}
                min="0"
                step={isUSD ? '0.01' : '1'}
                className={`${inputClasses} pl-8`}
              />
            </div>
          </div>
          <div>
            <label className={labelClasses}>세후 배당금</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[12px] text-dim">
                {isUSD ? '$' : '₩'}
              </span>
              <input
                type="number"
                value={amountNet}
                onChange={(e) => setAmountNet(e.target.value)}
                min="0"
                step={isUSD ? '0.01' : '1'}
                className={`${inputClasses} pl-8`}
              />
            </div>
          </div>
        </div>

        {/* 환율 (USD only) */}
        {isUSD && (
          <div>
            <label className={labelClasses}>환율 (₩/$)</label>
            <input
              type="number"
              value={fxRate}
              onChange={(e) => setFxRate(e.target.value)}
              placeholder="1450"
              min="0"
              step="1"
              className={inputClasses}
            />
          </div>
        )}

        {/* 재투자 */}
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={reinvested}
            onChange={(e) => setReinvested(e.target.checked)}
            className="w-4 h-4 rounded border-border-hover bg-surface-dim text-sodam focus:ring-sodam/30"
          />
          <span className="text-[13px] text-sub">배당 재투자</span>
        </label>

        {/* 요약 */}
        {parsedGross > 0 && (
          <div className="bg-card border border-border rounded-lg px-4 py-3 flex items-center justify-between">
            <span className="text-[12px] text-sub">원화 환산 세후</span>
            <div className="text-right">
              <div className="text-[15px] font-bold text-bright tabular-nums">
                {amountKRW.toLocaleString('ko-KR')}원
              </div>
              {isUSD && (
                <div className="text-[11px] text-dim mt-0.5">
                  ${parsedNet.toFixed(2)} × {parsedFxRate}원
                </div>
              )}
            </div>
          </div>
        )}

        {/* 면책 문구 */}
        <p className="text-[11px] text-dim leading-relaxed">
          배당소득세 정보는 참고용이며 법적 조언이 아닙니다.
        </p>

        {/* 에러 */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 text-[12px] text-red-400">
            {error}
          </div>
        )}

        {/* 제출 */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 rounded-lg text-[14px] font-bold transition-all disabled:opacity-40 bg-sodam/20 text-sodam hover:bg-sodam/30 border border-sodam/30"
        >
          {isSubmitting ? '처리 중...' : '배당 기록'}
        </button>
      </form>
    </Card>
  )
}
