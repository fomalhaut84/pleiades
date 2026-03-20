'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import ThemeToggle from '@/components/theme/ThemeToggle'
import { NAV_GROUPS, isPathActive, findActiveGroup } from './nav-config'
import type { NavItem } from './nav-config'

interface SidebarProps {
  accounts: { id: string; name: string; ownerAge: number | null }[]
}

const STORAGE_KEY = 'sidebar-collapsed'

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isPathActive(pathname, item.href)
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all border border-transparent
        ${active
          ? 'bg-surface text-bright font-semibold border-border'
          : 'text-sub hover:bg-surface-dim hover:text-muted'
        }`}
    >
      <span className="text-[15px] w-5 text-center">{item.icon}</span>
      {item.label}
    </Link>
  )
}

function NavSection({
  title,
  collapsed,
  onToggle,
  children,
}: {
  title: string
  collapsed: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between text-[10px] font-bold text-dim tracking-[1.5px] uppercase px-3 pt-4 pb-2 hover:text-sub transition-colors"
      >
        {title}
        <span className={`text-[10px] transition-transform ${collapsed ? '-rotate-90' : ''}`}>
          ▾
        </span>
      </button>
      {!collapsed && <div className="flex flex-col gap-0.5">{children}</div>}
    </div>
  )
}

export default function Sidebar({ accounts }: SidebarProps) {
  const pathname = usePathname()
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>({})
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        setCollapsedMap(JSON.parse(stored))
      }
    } catch { /* ignore */ }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(collapsedMap)) } catch { /* ignore */ }
    }
  }, [collapsedMap, hydrated])

  if (pathname.startsWith('/auth') || pathname === '/offline') return null

  const activeGroup = findActiveGroup(pathname)

  const colorMap: Record<string, string> = {
    '세진': 'bg-sejin',
    '소담': 'bg-sodam',
    '다솜': 'bg-dasom',
  }

  const toggleSection = (title: string) => {
    setCollapsedMap((prev) => ({ ...prev, [title]: !prev[title] }))
  }

  const isSectionCollapsed = (title: string) => {
    if (activeGroup === title) return false
    return collapsedMap[title] ?? false
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

      {/* Navigation — scrollable */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <NavSection
            key={group.title}
            title={group.title}
            collapsed={isSectionCollapsed(group.title)}
            onToggle={() => toggleSection(group.title)}
          >
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </NavSection>
        ))}

        {/* 계좌 */}
        <div className="text-[10px] font-bold text-dim tracking-[1.5px] uppercase px-3 pt-4 pb-2">
          계좌
        </div>

        {accounts.map((account) => (
          <Link
            key={account.id}
            href={`/accounts/${account.id}`}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all border border-transparent
              ${pathname === `/accounts/${account.id}`
                ? 'bg-surface text-bright font-semibold border-border'
                : 'text-sub hover:bg-surface-dim hover:text-muted'
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

      {/* Theme toggle */}
      <div className="px-4 py-3 border-t border-border">
        <ThemeToggle />
      </div>
    </aside>
  )
}
