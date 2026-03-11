import { formatKRW, formatUSD, calcCostKRW, calcCurrentValueKRW, calcProfitLoss, formatPercent, formatSignedKRW } from '@/lib/format'

interface PriceCacheEntry {
  ticker: string
  price: number
  change: number | null
  changePercent: number | null
  currency: string
}

interface Holding {
  id: string
  ticker: string
  displayName: string
  market: string
  shares: number
  avgPrice: number
  currency: string
  avgPriceFx: number | null
  avgFxRate: number | null
}

interface HoldingsTableProps {
  holdings: Holding[]
  priceMap: Map<string, PriceCacheEntry>
  currentFxRate: number
  hasPriceData: boolean
}

export default function HoldingsTable({ holdings, priceMap, currentFxRate, hasPriceData }: HoldingsTableProps) {
  const sorted = [...holdings].sort((a, b) => {
    const priceA = priceMap.get(a.ticker)
    const priceB = priceMap.get(b.ticker)
    const valA = priceA ? calcCurrentValueKRW(a, priceA.price, currentFxRate) : calcCostKRW(a)
    const valB = priceB ? calcCurrentValueKRW(b, priceB.price, currentFxRate) : calcCostKRW(b)
    return valB - valA
  })

  return (
    <div className="relative overflow-hidden rounded-[14px] border border-border bg-card">
      <div className="px-5 py-3.5 border-b border-border flex justify-between items-center">
        <div className="text-[13px] font-bold text-bright">보유종목</div>
        <div className="text-[12px] text-sub">{holdings.length}개</div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-sub tracking-wide uppercase border-b border-border bg-card">
                종목
              </th>
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-sub tracking-wide uppercase border-b border-border bg-card">
                시장
              </th>
              <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-sub tracking-wide uppercase border-b border-border bg-card">
                수량
              </th>
              <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-sub tracking-wide uppercase border-b border-border bg-card">
                평균단가
              </th>
              {hasPriceData && (
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-sub tracking-wide uppercase border-b border-border bg-card">
                  현재가
                </th>
              )}
              <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-sub tracking-wide uppercase border-b border-border bg-card">
                {hasPriceData ? '평가금' : '매입금'}
              </th>
              {hasPriceData && (
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-sub tracking-wide uppercase border-b border-border bg-card">
                  수익률
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((h) => {
              const price = priceMap.get(h.ticker)
              const costKRW = calcCostKRW(h)
              const currentValue = price
                ? calcCurrentValueKRW(h, price.price, currentFxRate)
                : costKRW
              const pl = price
                ? calcProfitLoss(h, price.price, currentFxRate)
                : null

              return (
                <tr key={h.id} className="hover:bg-card">
                  <td className="px-4 py-3 text-[13px] border-b border-border">
                    <span className="font-bold text-bright">{h.displayName}</span>
                  </td>
                  <td className="px-3 py-3 text-[13px] border-b border-border">
                    <span
                      className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                        h.market === 'US'
                          ? 'text-sodam bg-sodam/10'
                          : 'text-amber-400 bg-amber-400/10'
                      }`}
                    >
                      {h.market}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-[13px] text-right border-b border-border">
                    {h.shares}주
                  </td>
                  <td className="px-3 py-3 text-right border-b border-border">
                    <div className={h.currency === 'USD' ? 'text-[11px] text-sub' : 'text-[13px] text-muted font-semibold'}>
                      {h.currency === 'USD' ? formatUSD(h.avgPriceFx ?? h.avgPrice) : formatKRW(h.avgPrice)}
                    </div>
                  </td>
                  {hasPriceData && (
                    <td className="px-3 py-3 text-right border-b border-border">
                      {price ? (
                        <div className={h.currency === 'USD' ? 'text-[11px] text-sub' : 'text-[13px] text-muted font-semibold'}>
                          {h.currency === 'USD' ? formatUSD(price.price) : formatKRW(price.price)}
                        </div>
                      ) : (
                        <span className="text-[12px] text-dim">—</span>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-3 text-right border-b border-border">
                    <span className="font-semibold text-muted tabular-nums">
                      {formatKRW(currentValue)}
                    </span>
                  </td>
                  {hasPriceData && (
                    <td className="px-4 py-3 text-right border-b border-border">
                      {pl ? (
                        <div>
                          <div className={`font-bold tabular-nums ${pl.returnPct >= 0 ? 'text-sejin' : 'text-red-500'}`}>
                            {formatPercent(pl.returnPct)}
                          </div>
                          {h.currency === 'USD' && (
                            <div className="text-[10px] text-dim mt-0.5 leading-snug">
                              주가{' '}
                              <span className={pl.pricePL >= 0 ? 'text-sejin/65' : 'text-red-500/65'}>
                                {formatSignedKRW(pl.pricePL)}
                              </span>
                              {' · 환율 '}
                              <span className={pl.fxPL >= 0 ? 'text-sejin/65' : 'text-red-500/65'}>
                                {formatSignedKRW(pl.fxPL)}
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-[12px] text-dim">—</span>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
