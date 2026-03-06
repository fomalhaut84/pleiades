'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Card from '@/components/ui/Card'

interface Account {
  id: string
  name: string
  holdings: {
    ticker: string
    displayName: string
    market: string
    currency: string
    shares: number
  }[]
}

interface TradeFormProps {
  accounts: Account[]
}

const ACCOUNT_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  '세진': { border: 'border-sejin', bg: 'bg-sejin/10', text: 'text-sejin' },
  '소담': { border: 'border-sodam', bg: 'bg-sodam/10', text: 'text-sodam' },
  '다솜': { border: 'border-dasom', bg: 'bg-dasom/10', text: 'text-dasom' },
}

export default function TradeForm({ accounts }: TradeFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [accountId, setAccountId] = useState('')
  const [tradeType, setTradeType] = useState<'BUY' | 'SELL'>('BUY')
  const [tickerMode, setTickerMode] = useState<'select' | 'manual'>('select')
  const [selectedTicker, setSelectedTicker] = useState('')
  const [manualTicker, setManualTicker] = useState('')
  const [manualDisplayName, setManualDisplayName] = useState('')
  const [manualMarket, setManualMarket] = useState<'US' | 'KR'>('US')
  const [manualCurrency, setManualCurrency] = useState<'USD' | 'KRW'>('USD')
  const [shares, setShares] = useState('')
  const [price, setPrice] = useState('')
  const [fxRate, setFxRate] = useState('')
  const [tradedAt, setTradedAt] = useState(() => {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  })
  const [note, setNote] = useState('')

  // Derived
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
    ? (selectedHolding?.currency ?? 'USD')
    : manualCurrency

  const isUSD = currency === 'USD'

  // Fetch current FX rate when needed
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

  // Market/currency sync for manual mode
  useEffect(() => {
    if (tickerMode === 'manual') {
      setManualCurrency(manualMarket === 'US' ? 'USD' : 'KRW')
    }
  }, [manualMarket, tickerMode])

  // Reset ticker when account changes
  useEffect(() => {
    setSelectedTicker('')
    const acct = accounts.find((a) => a.id === accountId)
    setTickerMode(acct && acct.holdings.length > 0 ? 'select' : 'manual')
  }, [accountId, accounts])

  const rawShares = Number(shares)
  const parsedShares = Number.isInteger(rawShares) && rawShares > 0 ? rawShares : 0
  const sharesError = shares !== '' && parsedShares === 0
  const parsedPrice = parseFloat(price) || 0
  const parsedFxRate = parseFloat(fxRate) || 0

  const totalKRW = isUSD
    ? Math.round(parsedPrice * parsedShares * parsedFxRate)
    : Math.round(parsedPrice * parsedShares)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const ticker = tickerMode === 'select' ? selectedTicker : manualTicker.toUpperCase()
    const displayName = tickerMode === 'select'
      ? (selectedHolding?.displayName ?? ticker)
      : manualDisplayName
    const market = tickerMode === 'select'
      ? (selectedHolding?.market ?? 'US')
      : manualMarket

    try {
      const res = await fetch('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          ticker,
          displayName,
          market,
          type: tradeType,
          shares: parsedShares,
          price: parsedPrice,
          currency,
          fxRate: isUSD ? parsedFxRate : null,
          tradedAt,
          note: note || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? '거래 기록에 실패했습니다.')
        return
      }

      router.push('/trades')
      router.refresh()
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputClasses = 'w-full bg-white/[0.035] border border-white/[0.06] rounded-lg px-3.5 py-2.5 text-[13px] text-bright placeholder-dim focus:outline-none focus:bg-white/[0.055] focus:border-white/[0.14] transition-colors'
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
                      : 'border-white/[0.06] text-sub hover:bg-white/[0.03] hover:text-muted'
                  }`}
                >
                  {account.name}
                </button>
              )
            })}
          </div>
        </div>

        {/* 거래 유형 */}
        <div>
          <label className={labelClasses}>유형</label>
          <div className="grid grid-cols-2 gap-0 rounded-lg border border-white/[0.06] overflow-hidden">
            <button
              type="button"
              onClick={() => setTradeType('BUY')}
              className={`py-2.5 text-[13px] font-bold transition-all ${
                tradeType === 'BUY'
                  ? 'bg-sejin/15 text-sejin'
                  : 'text-sub hover:bg-white/[0.03]'
              }`}
            >
              매수
            </button>
            <button
              type="button"
              onClick={() => setTradeType('SELL')}
              className={`py-2.5 text-[13px] font-bold border-l border-white/[0.06] transition-all ${
                tradeType === 'SELL'
                  ? 'bg-red-500/15 text-red-500'
                  : 'text-sub hover:bg-white/[0.03]'
              }`}
            >
              매도
            </button>
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
            <div className="mt-3 flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
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
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClasses}>시장</label>
                  <div className="grid grid-cols-2 gap-0 rounded-lg border border-white/[0.06] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setManualMarket('US')}
                      className={`py-2 text-[12px] font-bold transition-all ${
                        manualMarket === 'US'
                          ? 'bg-sodam/15 text-sodam'
                          : 'text-sub hover:bg-white/[0.03]'
                      }`}
                    >
                      US
                    </button>
                    <button
                      type="button"
                      onClick={() => setManualMarket('KR')}
                      className={`py-2 text-[12px] font-bold border-l border-white/[0.06] transition-all ${
                        manualMarket === 'KR'
                          ? 'bg-amber-400/15 text-amber-400'
                          : 'text-sub hover:bg-white/[0.03]'
                      }`}
                    >
                      KR
                    </button>
                  </div>
                </div>
                <div>
                  <label className={labelClasses}>통화</label>
                  <div className={`${inputClasses} flex items-center text-dim cursor-default`}>
                    {manualCurrency === 'USD' ? 'USD ($)' : 'KRW (₩)'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 수량 */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[12px] font-semibold text-sub">수량</label>
            {tradeType === 'SELL' && selectedHolding && (
              <span className="text-[11px] text-dim">
                보유: {selectedHolding.shares}주
              </span>
            )}
          </div>
          <div className="relative">
            <input
              type="number"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              placeholder="0"
              min="1"
              step="1"
              className={`${inputClasses} pr-8`}
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[12px] text-dim">
              주
            </span>
          </div>
          {sharesError && (
            <p className="text-[11px] text-red-400 mt-1">1 이상의 정수를 입력해주세요.</p>
          )}
        </div>

        {/* 단가 */}
        <div>
          <label className={labelClasses}>단가</label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[12px] text-dim">
              {isUSD ? '$' : '₩'}
            </span>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0"
              min="0"
              step={isUSD ? '0.01' : '1'}
              className={`${inputClasses} pl-8`}
            />
          </div>
        </div>

        {/* 환율 (USD only) */}
        {isUSD && (
          <div>
            <label className={labelClasses}>환율 (₩/$ )</label>
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

        {/* 거래일 */}
        <div>
          <label className={labelClasses}>거래일</label>
          <input
            type="date"
            value={tradedAt}
            onChange={(e) => setTradedAt(e.target.value)}
            className={inputClasses}
          />
        </div>

        {/* 메모 */}
        <div>
          <label className={labelClasses}>메모 (선택)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="메모를 입력하세요"
            maxLength={200}
            className={inputClasses}
          />
        </div>

        {/* 예상 총액 */}
        {parsedShares > 0 && parsedPrice > 0 && (
          <div className="bg-white/[0.025] border border-white/[0.06] rounded-lg px-4 py-3 flex items-center justify-between">
            <span className="text-[12px] text-sub">예상 총액</span>
            <div className="text-right">
              <div className="text-[15px] font-bold text-bright tabular-nums">
                {totalKRW.toLocaleString('ko-KR')}원
              </div>
              {isUSD && (
                <div className="text-[11px] text-dim mt-0.5">
                  ${(parsedPrice * parsedShares).toFixed(2)} × {parsedFxRate}원
                </div>
              )}
            </div>
          </div>
        )}

        {/* 에러 메시지 */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 text-[12px] text-red-400">
            {error}
          </div>
        )}

        {/* 제출 */}
        <button
          type="submit"
          disabled={isSubmitting}
          className={`w-full py-3 rounded-lg text-[14px] font-bold transition-all disabled:opacity-40 ${
            tradeType === 'BUY'
              ? 'bg-sejin/20 text-sejin hover:bg-sejin/30 border border-sejin/30'
              : 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
          }`}
        >
          {isSubmitting ? '처리 중...' : tradeType === 'BUY' ? '매수 기록' : '매도 기록'}
        </button>
      </form>
    </Card>
  )
}
