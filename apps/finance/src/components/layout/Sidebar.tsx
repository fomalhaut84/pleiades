'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface SidebarProps {
  accounts: { id: string; name: string; ownerAge: number | null }[]
}

export default function Sidebar({ accounts }: SidebarProps) {
  const pathname = usePathname()

  const colorMap: Record<string, string> = {
    '세진': 'bg-sejin',
    '소담': 'bg-sodam',
    '다솜': 'bg-dasom',
  }

  return (
    <aside className="fixed top-0 left-0 w-[220px] h-screen bg-bg-raised border-r border-border flex-col z-50 hidden lg:flex">
      {/* Logo */}
      <div className="px-6 pt-7 pb-6 border-b border-border">
        <h1 className="text-[17px] font-extrabold text-bright tracking-tight">
          myFinance
        </h1>
        <span className="text-[11px] text-sub tracking-wide mt-1 block">
          가족 자산관리
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
        <Link
          href="/"
          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all border border-transparent
            ${pathname === '/'
              ? 'bg-white/5 text-bright font-semibold border-border'
              : 'text-sub hover:bg-white/[0.03] hover:text-muted'
            }`}
        >
          <span className="text-[15px] w-5 text-center">📊</span>
          대시보드
        </Link>

        <Link
          href="/trades"
          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all border border-transparent
            ${pathname.startsWith('/trades')
              ? 'bg-white/5 text-bright font-semibold border-border'
              : 'text-sub hover:bg-white/[0.03] hover:text-muted'
            }`}
        >
          <span className="text-[15px] w-5 text-center">📝</span>
          거래
        </Link>

        <Link
          href="/rsu"
          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all border border-transparent
            ${pathname.startsWith('/rsu')
              ? 'bg-white/5 text-bright font-semibold border-border'
              : 'text-sub hover:bg-white/[0.03] hover:text-muted'
            }`}
        >
          <span className="text-[15px] w-5 text-center">🏢</span>
          RSU
        </Link>

        <Link
          href="/dividends"
          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all border border-transparent
            ${pathname.startsWith('/dividends')
              ? 'bg-white/5 text-bright font-semibold border-border'
              : 'text-sub hover:bg-white/[0.03] hover:text-muted'
            }`}
        >
          <span className="text-[15px] w-5 text-center">💰</span>
          배당금
        </Link>

        <div className="text-[10px] font-bold text-dim tracking-[1.5px] uppercase px-3 pt-4 pb-2">
          계좌
        </div>

        {accounts.map((account) => (
          <Link
            key={account.id}
            href={`/accounts/${account.id}`}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all border border-transparent
              ${pathname === `/accounts/${account.id}`
                ? 'bg-white/5 text-bright font-semibold border-border'
                : 'text-sub hover:bg-white/[0.03] hover:text-muted'
              }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${colorMap[account.name] ?? 'bg-dim'}`} />
            {account.name}
            {account.ownerAge != null && (
              <span className="text-[12px] text-sub ml-auto">
                {account.ownerAge}세
              </span>
            )}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
