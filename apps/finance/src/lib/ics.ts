/**
 * RFC 5545 (iCalendar) 직렬화 헬퍼.
 * 종일 이벤트 위주 (DTSTART;VALUE=DATE).
 * CRLF 라인 종결, 텍스트 이스케이프 처리.
 */

export interface ICSEvent {
  /** 안정된 식별자. 동일 이벤트는 동일 UID. */
  uid: string
  summary: string
  /** YYYY-MM-DD (KST 또는 사용자 로컬 캘린더 날짜). */
  date: string
  description?: string
}

export interface BuildICSOptions {
  prodId?: string
  calName?: string
  /** ISO 8601 UTC 타임스탬프. 미지정 시 호출 시점 사용 (테스트에서는 명시 권장). */
  dtstamp?: string
}

const DEFAULT_PROD_ID = '-//myFinance//Vesting Calendar//KO'
const DEFAULT_CAL_NAME = 'myFinance 베스팅'

/**
 * RFC 5545 텍스트 이스케이프: \, comma, semicolon, newline.
 * CRLF/CR/LF 모두 리터럴 `\n` 으로 정규화 — raw CR/LF 가 content line 종결자와
 * 충돌하지 않도록 보장.
 */
export function escapeICSText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

const MAX_LINE_OCTETS = 75
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

/**
 * RFC 5545 §3.1 content line folding.
 * 75 octets 초과 시 CRLF + (space) 로 줄 접기.
 * UTF-8 multi-byte 문자 중간을 자르지 않도록 boundary 보존.
 *
 * RFC 5545 의 75 octets 한계는 "line break 제외" 이므로 leading space (1 byte)
 * 는 line 의 일부로 카운트된다. 따라서 첫 segment 는 75 octets, 연속 segments 는
 * 74 octets 까지만 허용 (1 byte 를 leading space 에 예약).
 */
export function foldICSLine(line: string): string {
  const bytes = textEncoder.encode(line)
  if (bytes.length <= MAX_LINE_OCTETS) return line

  const segments: string[] = []
  let start = 0
  while (start < bytes.length) {
    const limit = segments.length === 0 ? MAX_LINE_OCTETS : MAX_LINE_OCTETS - 1
    let end = Math.min(start + limit, bytes.length)
    // UTF-8 boundary 후퇴: 10xxxxxx 는 continuation byte
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) {
      end--
    }
    segments.push(textDecoder.decode(bytes.slice(start, end)))
    start = end
  }
  return segments.join('\r\n ')
}

/** YYYY-MM-DD → YYYYMMDD (RFC 5545 DATE 형식). */
function formatICSDate(date: string): string {
  return date.replace(/-/g, '')
}

/** Date → 20260615T120000Z (RFC 5545 DATE-TIME UTC 형식). */
function formatICSDateTimeUTC(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

/**
 * ICSEvent[] 를 RFC 5545 iCalendar 문자열로 직렬화.
 * 종일 이벤트(DTSTART;VALUE=DATE)로만 출력.
 */
export function buildICS(events: ICSEvent[], opts?: BuildICSOptions): string {
  const prodId = opts?.prodId ?? DEFAULT_PROD_ID
  const calName = opts?.calName ?? DEFAULT_CAL_NAME
  const dtstamp = opts?.dtstamp
    ? formatICSDateTimeUTC(new Date(opts.dtstamp))
    : formatICSDateTimeUTC(new Date())

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${escapeICSText(prodId)}`,
    `X-WR-CALNAME:${escapeICSText(calName)}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]

  for (const ev of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${ev.uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${formatICSDate(ev.date)}`,
      `SUMMARY:${escapeICSText(ev.summary)}`,
    )
    if (ev.description) {
      lines.push(`DESCRIPTION:${escapeICSText(ev.description)}`)
    }
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')

  return lines.map(foldICSLine).join('\r\n') + '\r\n'
}
