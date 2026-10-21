import { ReactNode } from 'react'

interface HeaderProps {
  title: string
  sub?: string
  badge?: string
  children?: ReactNode
}

export default function Header({ title, sub, badge, children }: HeaderProps) {
  return (
    <div className="sticky top-0 z-40 px-4 sm:px-8 py-4 sm:py-5 bg-header-blur backdrop-blur-xl border-b border-border flex justify-between items-center">
      <div>
        <div className="text-[15px] font-bold text-bright">{title}</div>
        {sub && <div className="text-[12px] text-sub mt-0.5">{sub}</div>}
      </div>
      <div className="flex items-center gap-3">
        {children}
        {badge && (
          <div className="text-[11px] text-sub bg-surface-dim px-3 py-1.5 rounded-md border border-border">
            {badge}
          </div>
        )}
      </div>
    </div>
  )
}
