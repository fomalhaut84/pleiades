'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface BottomTabProps {
  accounts: { id: string; name: string }[]
}

const colorMap: Record<string, string> = {
  '세진': 'text-sejin',
  '소담': 'text-sodam',
  '다솜': 'text-dasom',
}

export default function BottomTab({ accounts }: BottomTabProps) {
  const pathname = usePathname()

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-bg-raised border-t border-border z-50 lg:hidden pb-[env(safe-area-inset-bottom,8px)]">
      <div className="flex justify-around items-center">
        <Link
          href="/"
          className={`flex flex-col items-center gap-1 py-2 px-3 rounded-lg ${
            pathname === '/' ? 'text-bright' : 'text-dim'
          }`}
        >
          <span className="text-lg">📊</span>
          <span className="text-[11px] font-semibold">대시보드</span>
        </Link>

        <Link
          href="/trades"
          className={`flex flex-col items-center gap-1 py-2 px-3 rounded-lg ${
            pathname.startsWith('/trades') ? 'text-bright' : 'text-dim'
          }`}
        >
          <span className="text-lg">📝</span>
          <span className="text-[11px] font-semibold">거래</span>
        </Link>

        <Link
          href="/rsu"
          className={`flex flex-col items-center gap-1 py-2 px-3 rounded-lg ${
            pathname.startsWith('/rsu') ? 'text-bright' : 'text-dim'
          }`}
        >
          <span className="text-lg">🏢</span>
          <span className="text-[11px] font-semibold">RSU</span>
        </Link>

        <Link
          href="/dividends"
          className={`flex flex-col items-center gap-1 py-2 px-3 rounded-lg ${
            pathname.startsWith('/dividends') ? 'text-bright' : 'text-dim'
          }`}
        >
          <span className="text-lg">💰</span>
          <span className="text-[11px] font-semibold">배당금</span>
        </Link>

        <Link
          href="/deposits"
          className={`flex flex-col items-center gap-1 py-2 px-3 rounded-lg ${
            pathname.startsWith('/deposits') ? 'text-bright' : 'text-dim'
          }`}
        >
          <span className="text-lg">🎁</span>
          <span className="text-[11px] font-semibold">입금</span>
        </Link>

        {accounts.map((account) => (
          <Link
            key={account.id}
            href={`/accounts/${account.id}`}
            className={`flex flex-col items-center gap-1 py-2 px-3 rounded-lg ${
              pathname === `/accounts/${account.id}` ? 'text-bright' : 'text-dim'
            }`}
          >
            <span className={`text-lg ${colorMap[account.name] ?? ''}`}>●</span>
            <span className="text-[11px] font-semibold">{account.name}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
