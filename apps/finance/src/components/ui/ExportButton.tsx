'use client'

interface ExportButtonProps {
  href: string
  label?: string
}

export default function ExportButton({ href, label = 'CSV' }: ExportButtonProps) {
  return (
    <a
      href={href}
      download
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-dim text-sub text-[12px] sm:text-[13px] font-semibold border border-border hover:bg-surface-hover transition-all"
    >
      <span className="hidden sm:inline">↓</span> {label}
    </a>
  )
}
