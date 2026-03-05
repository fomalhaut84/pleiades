interface HeaderProps {
  title: string
  sub?: string
  badge?: string
}

export default function Header({ title, sub, badge }: HeaderProps) {
  return (
    <div className="sticky top-0 z-40 px-8 py-5 bg-[rgba(7,8,12,0.85)] backdrop-blur-xl border-b border-border flex justify-between items-center">
      <div>
        <div className="text-[15px] font-bold text-bright">{title}</div>
        {sub && <div className="text-[12px] text-sub mt-0.5">{sub}</div>}
      </div>
      {badge && (
        <div className="text-[11px] text-sub bg-white/[0.04] px-3 py-1.5 rounded-md border border-border">
          {badge}
        </div>
      )}
    </div>
  )
}
