import Card from '@/components/ui/Card'
import { formatKRW } from '@/lib/format'

interface AccountSummary {
  name: string
  totalKRW: number
  holdingsCount: number
}

interface FamilyTotalCardProps {
  accounts: AccountSummary[]
}

const COLOR_MAP: Record<string, string> = {
  '세진': 'text-sejin',
  '소담': 'text-sodam',
  '다솜': 'text-dasom',
}

export default function FamilyTotalCard({ accounts }: FamilyTotalCardProps) {
  const grandTotal = accounts.reduce((sum, a) => sum + a.totalKRW, 0)
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
        </div>
        <div className="text-right">
          <div className="text-[12px] text-sub">
            {accounts.length}개 계좌 · {totalHoldings}종목
          </div>
          <div className="text-[12px] text-sub mt-1">매입금 기준 합산</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-px bg-border rounded-lg overflow-hidden">
        {accounts.map((account) => (
          <div key={account.name} className="bg-bg p-3 text-center">
            <div className="text-[12px] text-sub tracking-wide">
              {account.name}
            </div>
            <div className={`text-[16px] font-extrabold mt-1 ${COLOR_MAP[account.name] ?? 'text-bright'}`}>
              {formatKRW(account.totalKRW)}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
