import Link from 'next/link'
import type { VestingEvent, VestingEventStatus } from '@/lib/vesting-events'

function formatShares(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n)
}

function statusMarker(status: VestingEventStatus): string {
  if (status === 'expired') return '✗'
  if (status === 'exercised' || status === 'vested' || status === 'exercisable') return '✓'
  return ''
}

function variantClasses(event: VestingEvent): string {
  const base = 'inline-flex items-center gap-1 px-1.5 py-px rounded text-[10px] font-bold tracking-wide whitespace-nowrap'
  if (event.status === 'expired') {
    return `${base} bg-surface text-dim`
  }
  const color = event.type === 'RSU'
    ? 'bg-sejin/15 text-sejin'
    : 'bg-sodam/15 text-sodam'
  const muted = event.status === 'exercised' ? 'opacity-50' : ''
  return [base, color, muted].filter(Boolean).join(' ')
}

interface Props {
  event: VestingEvent
}

export default function VestingEventBar({ event }: Props) {
  const label = `${statusMarker(event.status)} ${formatShares(event.shares)}`.trim()
  const title = `${event.displayName} ${event.shares}주 (${event.status})`
  return (
    <Link
      href={event.link}
      title={title}
      aria-label={`${event.displayName} ${event.shares}주, ${event.status}`}
      className={variantClasses(event)}
    >
      {label}
    </Link>
  )
}
