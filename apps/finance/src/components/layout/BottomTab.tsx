'use client'

import { useState } from 'react'
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

const MORE_ITEMS = [
  { href: '/rsu', icon: '🏢', label: 'RSU' },
  { href: '/dividends', icon: '💰', label: '배당금' },
  { href: '/deposits', icon: '🎁', label: '입금/증여' },
  { href: '/stock-options', icon: '📊', label: '스톡옵션' },
  { href: '/simulator', icon: '🔮', label: '시뮬레이터' },
  { href: '/performance', icon: '📈', label: '수익률 분석' },
]

export default function BottomTab({ accounts }: BottomTabProps) {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)

  const FIXED_TAB_PATHS = ['/', '/trades', '/tax']
  const isMoreActive = (
    MORE_ITEMS.some((item) => pathname.startsWith(item.href))
    || accounts.some((a) => pathname === `/accounts/${a.id}`)
  ) && !FIXED_TAB_PATHS.some((p) => p === '/' ? pathname === '/' : pathname.startsWith(p))

  return (
    <>
      {/* 더보기 오버레이 */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-[60] lg:hidden"
          onClick={() => setMoreOpen(false)}
        >
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="absolute bottom-[60px] left-0 right-0 bg-bg-raised border-t border-border rounded-t-2xl px-4 pt-4 pb-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid grid-cols-4 gap-1 mb-3">
              {MORE_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={`flex flex-col items-center gap-1 py-2.5 rounded-lg transition-colors ${
                    pathname.startsWith(item.href) ? 'text-bright bg-white/[0.05]' : 'text-sub'
                  }`}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span className="text-[11px] font-medium">{item.label}</span>
                </Link>
              ))}
            </div>

            {/* 계좌 바로가기 */}
            <div className="border-t border-white/[0.06] pt-2">
              <div className="text-[10px] text-dim font-bold tracking-wider uppercase px-1 mb-1.5">계좌</div>
              <div className="flex gap-2">
                {accounts.map((account) => (
                  <Link
                    key={account.id}
                    href={`/accounts/${account.id}`}
                    onClick={() => setMoreOpen(false)}
                    className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg transition-colors ${
                      pathname === `/accounts/${account.id}` ? 'text-bright bg-white/[0.05]' : 'text-sub'
                    }`}
                  >
                    <span className={`text-lg ${colorMap[account.name] ?? ''}`}>●</span>
                    <span className="text-[11px] font-medium">{account.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 하단 탭 바 */}
      <div className="fixed bottom-0 left-0 right-0 bg-bg-raised border-t border-border z-50 lg:hidden pb-[env(safe-area-inset-bottom,0px)]">
        <div className="flex justify-around items-center">
          <Link
            href="/"
            className={`flex flex-col items-center gap-0.5 py-2 px-3 ${
              pathname === '/' ? 'text-bright' : 'text-dim'
            }`}
          >
            <span className="text-lg">📊</span>
            <span className="text-[10px] font-semibold">대시보드</span>
          </Link>

          <Link
            href="/trades"
            className={`flex flex-col items-center gap-0.5 py-2 px-3 ${
              pathname.startsWith('/trades') ? 'text-bright' : 'text-dim'
            }`}
          >
            <span className="text-lg">📝</span>
            <span className="text-[10px] font-semibold">거래</span>
          </Link>

          <Link
            href="/tax"
            className={`flex flex-col items-center gap-0.5 py-2 px-3 ${
              pathname.startsWith('/tax') ? 'text-bright' : 'text-dim'
            }`}
          >
            <span className="text-lg">🧾</span>
            <span className="text-[10px] font-semibold">세금</span>
          </Link>

          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className={`flex flex-col items-center gap-0.5 py-2 px-3 ${
              moreOpen || isMoreActive ? 'text-bright' : 'text-dim'
            }`}
          >
            <span className="text-lg">☰</span>
            <span className="text-[10px] font-semibold">더보기</span>
          </button>
        </div>
      </div>
    </>
  )
}
