'use client'

import { useMemo, useState } from 'react'
import {
  buildMonthGrid,
  groupEventsByDate,
  toKSTDateString,
  type VestingEvent,
} from '@/lib/vesting-events'
import VestingEventBar from './VestingEventBar'

interface Props {
  events: VestingEvent[]
  todayMs: number
}

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MAX_BARS_PER_CELL = 3

function kstYearMonth(todayMs: number): { year: number; month: number } {
  const todayKey = toKSTDateString(new Date(todayMs))
  const [y, m] = todayKey.split('-').map(Number)
  return { year: y, month: m - 1 }
}

export default function VestingCalendar({ events, todayMs }: Props) {
  const todayKey = useMemo(() => toKSTDateString(new Date(todayMs)), [todayMs])
  const todayYM = useMemo(() => kstYearMonth(todayMs), [todayMs])
  const [cursor, setCursor] = useState(todayYM)

  const grid = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor])
  const byDate = useMemo(() => groupEventsByDate(events), [events])

  const go = (delta: number) => {
    setCursor((prev) => {
      const next = new Date(prev.year, prev.month + delta, 1)
      return { year: next.getFullYear(), month: next.getMonth() }
    })
  }

  const jumpToToday = () => {
    setCursor(todayYM)
  }

  const monthLabel = `${cursor.year}년 ${cursor.month + 1}월`

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-4">
          <h2 className="text-[18px] font-bold text-bright tracking-tight tabular-nums">
            {monthLabel}
          </h2>
          <span className="hidden sm:inline text-[11px] text-dim">KST 기준</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => go(-1)}
            className="px-2.5 py-1.5 rounded-md text-[12px] font-semibold text-sub border border-border hover:bg-surface hover:text-bright transition-colors"
          >
            ← 이전
          </button>
          <button
            type="button"
            onClick={jumpToToday}
            className="px-2.5 py-1.5 rounded-md text-[12px] font-bold text-bright bg-surface border border-border hover:bg-surface-hover transition-colors"
          >
            오늘
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            className="px-2.5 py-1.5 rounded-md text-[12px] font-semibold text-sub border border-border hover:bg-surface hover:text-bright transition-colors"
          >
            다음 →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 px-2 pt-3 pb-2 text-[10px] font-bold text-dim tracking-[1.2px] uppercase">
        {WEEKDAYS.map((d, i) => (
          <div key={d} className={`px-3 ${i === 0 ? 'text-red-400/80' : ''}`}>
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px px-2 pb-3">
        {grid.map((d) => {
          const key = toKSTDateString(d)
          const otherMonth = d.getMonth() !== cursor.month
          const isToday = key === todayKey
          const dayEvents = byDate.get(key) ?? []
          const dow = d.getDay()

          const dayColor = dow === 0 ? 'text-red-400' : otherMonth ? 'text-dim' : 'text-sub'
          const cellClass = [
            'rounded-lg px-2.5 py-2 min-h-[88px] sm:min-h-[104px] flex flex-col gap-1.5 transition-colors',
            otherMonth ? 'opacity-40' : 'hover:bg-surface',
            isToday ? 'bg-amber-500/10 ring-1 ring-inset ring-amber-500/40' : '',
          ].filter(Boolean).join(' ')

          return (
            <div key={key} className={cellClass}>
              <div className="flex items-center justify-between">
                <span className={`text-[12px] font-bold tabular-nums ${dayColor}`}>
                  {d.getDate()}
                </span>
                {dayEvents.length > 1 && (
                  <span className="text-[9px] text-dim tabular-nums">{dayEvents.length}</span>
                )}
              </div>
              <div className="flex flex-col gap-1 items-start">
                {dayEvents.slice(0, MAX_BARS_PER_CELL).map((ev) => (
                  <VestingEventBar key={ev.id} event={ev} />
                ))}
                {dayEvents.length > MAX_BARS_PER_CELL && (
                  <span className="text-[10px] text-dim">
                    +{dayEvents.length - MAX_BARS_PER_CELL}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-t border-border text-[11px] text-sub">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-sejin" /> RSU
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-sodam" /> 스톡옵션
        </span>
        <span className="ml-auto text-dim text-[10px]">
          미베스팅(점) · 베스팅 완료(✓) · 행사 완료(엷음) · 만료(회색 ✗)
        </span>
      </div>
    </div>
  )
}
