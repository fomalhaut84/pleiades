import { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  glowColor?: string
  clickable?: boolean
  onClick?: () => void
}

export default function Card({
  children,
  className = '',
  glowColor,
  clickable = false,
  onClick,
}: CardProps) {
  const baseClasses =
    'relative overflow-hidden rounded-[14px] border border-border bg-card p-5 transition-all duration-200'
  const hoverClasses = clickable
    ? 'cursor-pointer hover:bg-card-hover hover:border-border-hover hover:-translate-y-px'
    : ''

  return (
    <div
      className={`${baseClasses} ${hoverClasses} ${className}`}
      onClick={onClick}
    >
      {glowColor && (
        <div
          className="absolute top-0 left-0 right-0 h-px opacity-60"
          style={{
            background: `linear-gradient(90deg, transparent, ${glowColor}, transparent)`,
          }}
        />
      )}
      {children}
    </div>
  )
}
