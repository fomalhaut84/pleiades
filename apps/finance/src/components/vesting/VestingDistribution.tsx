import { upcomingEvents, type VestingEvent } from '@/lib/vesting-events'

interface Props {
  events: VestingEvent[]
  todayMs: number
  days: number
}

interface Row {
  accountName: string
  rsuShares: number
  optShares: number
  totalShares: number
}

const ACCOUNT_COLOR: Record<string, string> = {
  세진: 'bg-sejin',
  소담: 'bg-sodam',
  다솜: 'bg-dasom',
}
const FALLBACK_COLOR = 'bg-sub'

function buildRows(events: VestingEvent[]): Row[] {
  const map = new Map<string, Row>()
  for (const ev of events) {
    const cur = map.get(ev.accountName) ?? {
      accountName: ev.accountName,
      rsuShares: 0,
      optShares: 0,
      totalShares: 0,
    }
    if (ev.type === 'RSU') cur.rsuShares += ev.shares
    else cur.optShares += ev.shares
    cur.totalShares = cur.rsuShares + cur.optShares
    map.set(ev.accountName, cur)
  }
  return Array.from(map.values()).sort((a, b) => b.totalShares - a.totalShares)
}

function formatShares(n: number): string {
  return n.toLocaleString('ko-KR')
}

export default function VestingDistribution({ events, todayMs, days }: Props) {
  const upcoming = upcomingEvents(events, days, todayMs)
  const rows = buildRows(upcoming)
  const grandTotal = rows.reduce((s, r) => s + r.totalShares, 0)

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between border-b border-border">
        <h3 className="text-[14px] font-bold text-bright">계좌별 분포</h3>
        <span className="text-[11px] text-sub tabular-nums">
          {days}일 이내 · {formatShares(grandTotal)}주
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-[12px] text-dim">다가오는 베스팅이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-3 px-5 py-4">
          {rows.map((row) => {
            const accent = ACCOUNT_COLOR[row.accountName] ?? FALLBACK_COLOR
            const pct = grandTotal > 0 ? (row.totalShares / grandTotal) * 100 : 0
            const rsuPct = row.totalShares > 0 ? (row.rsuShares / row.totalShares) * 100 : 0
            return (
              <li key={row.accountName} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${accent}`} />
                    <span className="font-semibold text-bright">{row.accountName}</span>
                  </span>
                  <span className="tabular-nums text-sub">
                    {formatShares(row.totalShares)}주
                    <span className="text-dim ml-1.5">· {pct.toFixed(0)}%</span>
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-surface overflow-hidden flex">
                  {row.rsuShares > 0 && (
                    <span
                      className="bg-sejin h-full"
                      style={{ width: `${rsuPct}%` }}
                      title={`RSU ${formatShares(row.rsuShares)}주`}
                    />
                  )}
                  {row.optShares > 0 && (
                    <span
                      className="bg-sodam h-full"
                      style={{ width: `${100 - rsuPct}%` }}
                      title={`스톡옵션 ${formatShares(row.optShares)}주`}
                    />
                  )}
                </div>
                <div className="flex items-center justify-between text-[10px] text-dim tabular-nums">
                  <span>RSU {formatShares(row.rsuShares)}주</span>
                  <span>스톡옵션 {formatShares(row.optShares)}주</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
