import Card from '@/components/ui/Card'
import { formatKRW, formatPercent, formatSignedKRW } from '@/lib/format'

interface AccountSummary {
  name: string
  currentValueKRW: number
  costKRW: number
  returnPct: number
  holdingsCount: number
}

interface FamilyTotalCardProps {
  accounts: AccountSummary[]
  hasPriceData: boolean
}

const COLOR_MAP: Record<string, string> = {
  '세진': 'text-sejin',
  '소담': 'text-sodam',
  '다솜': 'text-dasom',
}

export default function FamilyTotalCard({ accounts, hasPriceData }: FamilyTotalCardProps) {
  const grandTotal = accounts.reduce((sum, a) => sum + a.currentValueKRW, 0)
  const grandCost = accounts.reduce((sum, a) => sum + a.costKRW, 0)
  const grandPL = grandTotal - grandCost
  const grandReturnPct = grandCost > 0 ? (grandPL / grandCost) * 100 : 0
  const totalHoldings = accounts.reduce((sum, a) => sum + a.holdingsCount, 0)

  return (
    <Card glowColor="#a78bfa" className="mb-6 shadow-[0_0_60px_rgba(167,139,250,0.04)]">
      <div className="flex justify-between items-start mb-5">
        <div>
          <div className="text-[11px] text-sub tracking-[1.5px] uppercase font-semibold">
            Family Total
          </div>
          <div className="text-[32px] font-black text-bright tracking-tight mt-1.5">
            {formatKRW(grandTotal)}
          </div>
          {hasPriceData && (
            <div className="flex items-baseline gap-2.5 mt-1.5">
              <span className={`text-[16px] font-extrabold ${grandReturnPct >= 0 ? 'text-sejin' : 'text-red-500'}`}>
                {formatPercent(grandReturnPct)}
              </span>
              <span className={`text-[12px] font-semibold ${grandPL >= 0 ? 'text-sejin' : 'text-red-500'}`}>
                {formatSignedKRW(grandPL)}
              </span>
            </div>
          )}
          <div className="text-[11px] text-dim mt-1">
            {hasPriceData ? `매입금 ${formatKRW(grandCost)}` : '매입금 기준 합산'}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[12px] text-sub">
            {accounts.length}개 계좌 · {totalHoldings}종목
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-px bg-border rounded-lg overflow-hidden">
        {accounts.map((account) => (
          <div key={account.name} className="bg-bg p-3 text-center">
            <div className="text-[12px] text-sub tracking-wide">
              {account.name}
            </div>
            <div className={`text-[16px] font-extrabold mt-1 ${COLOR_MAP[account.name] ?? 'text-bright'}`}>
              {formatKRW(account.currentValueKRW)}
            </div>
            {hasPriceData && (
              <div className={`text-[12px] font-bold mt-0.5 ${account.returnPct >= 0 ? 'text-sejin' : 'text-red-500'}`}>
                {formatPercent(account.returnPct)}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}
