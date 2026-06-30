/**
 * 베스팅 캘린더용 이벤트 통합 헬퍼.
 * RSUSchedule + StockOptionVesting 을 단일 VestingEvent[] 로 정규화.
 * 모든 날짜는 KST 기준 YYYY-MM-DD 캘린더 문자열로 저장.
 */

export type VestingEventType = 'RSU' | 'OPTION'
export type VestingEventStatus =
  | 'pending'
  | 'exercisable'
  | 'vested'
  | 'exercised'
  | 'expired'

export interface VestingEvent {
  id: string
  type: VestingEventType
  date: string                    // YYYY-MM-DD (KST)
  accountId: string
  accountName: string
  ticker: string | null
  displayName: string
  shares: number
  status: VestingEventStatus
  link: string
  meta?: {
    strikePrice?: number
    basisValue?: number
  }
}

interface RSUSource {
  id: string
  vestingDate: Date | string
  shares: number
  accountId: string
  status: string
  basisValue: number
  account: { name: string }
}

interface OptionSource {
  id: string
  ticker: string
  displayName: string
  strikePrice: number
  accountId: string
  account: { name: string }
  vestings: Array<{
    id: string
    vestingDate: Date | string
    shares: number
    status: string
  }>
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/** Date/문자열을 KST 캘린더 날짜 (YYYY-MM-DD) 로 변환. */
export function toKSTDateString(input: Date | string): string {
  const ms = typeof input === 'string' ? Date.parse(input) : input.getTime()
  const d = new Date(ms + KST_OFFSET_MS)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/**
 * KST 캘린더 기준 두 날짜 사이 일수 차 (target - today).
 * - 양수: target 가 미래 (예: 3 = 3일 후)
 * - 0: 오늘
 * - 음수: target 가 과거 (예: -1 = 어제)
 */
export function diffDaysKST(targetKey: string, nowMs: number): number {
  const todayKey = toKSTDateString(new Date(nowMs))
  const [ty, tm, td] = todayKey.split('-').map(Number)
  const [ey, em, ed] = targetKey.split('-').map(Number)
  const todayUtc = Date.UTC(ty, tm - 1, td)
  const targetUtc = Date.UTC(ey, em - 1, ed)
  return Math.round((targetUtc - todayUtc) / 86400000)
}

function normalizeRsuStatus(raw: string): VestingEventStatus {
  if (raw === 'vested') return 'vested'
  return 'pending'
}

function normalizeOptionStatus(raw: string): VestingEventStatus {
  if (raw === 'exercisable') return 'exercisable'
  if (raw === 'exercised') return 'exercised'
  if (raw === 'expired') return 'expired'
  return 'pending'
}

export function toVestingEvents(rsus: RSUSource[], options: OptionSource[]): VestingEvent[] {
  const events: VestingEvent[] = []

  for (const r of rsus) {
    events.push({
      id: `rsu_${r.id}`,
      type: 'RSU',
      date: toKSTDateString(r.vestingDate),
      accountId: r.accountId,
      accountName: r.account.name,
      ticker: null,
      displayName: 'RSU',
      shares: r.shares,
      status: normalizeRsuStatus(r.status),
      link: '/rsu',
      meta: { basisValue: r.basisValue },
    })
  }

  for (const opt of options) {
    for (const v of opt.vestings) {
      events.push({
        id: `opt_${v.id}`,
        type: 'OPTION',
        date: toKSTDateString(v.vestingDate),
        accountId: opt.accountId,
        accountName: opt.account.name,
        ticker: opt.ticker,
        displayName: opt.displayName,
        shares: v.shares,
        status: normalizeOptionStatus(v.status),
        link: '/stock-options',
        meta: { strikePrice: opt.strikePrice },
      })
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date))
}

export function groupEventsByDate(events: VestingEvent[]): Map<string, VestingEvent[]> {
  const map = new Map<string, VestingEvent[]>()
  for (const ev of events) {
    const list = map.get(ev.date) ?? []
    list.push(ev)
    map.set(ev.date, list)
  }
  return map
}

/**
 * 오늘부터 N일 안 이벤트만 필터 (KST 캘린더 기준, 오늘 포함).
 * 종료/만료 상태는 제외.
 */
export function upcomingEvents(
  events: VestingEvent[],
  days: number,
  nowMs: number
): VestingEvent[] {
  const todayKey = toKSTDateString(new Date(nowMs))
  const limitDate = new Date(nowMs + KST_OFFSET_MS + days * 86400000)
  const limitKey = `${limitDate.getUTCFullYear()}-${String(limitDate.getUTCMonth() + 1).padStart(2, '0')}-${String(limitDate.getUTCDate()).padStart(2, '0')}`
  return events.filter((ev) => {
    if (ev.status === 'exercised' || ev.status === 'expired') return false
    return ev.date >= todayKey && ev.date <= limitKey
  })
}

/**
 * 한 달의 캘린더 그리드 (6 행 x 7 열, 일요일 시작).
 * 인접 월 셀 포함. 반환은 평탄 42 셀.
 */
export function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const startOffset = first.getDay()
  const cells: Date[] = []
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(year, month, 1 - startOffset + i))
  }
  return cells
}
