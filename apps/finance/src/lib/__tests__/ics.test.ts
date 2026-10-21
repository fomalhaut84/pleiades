import { describe, expect, it } from 'vitest'
import { buildICS, escapeICSText, foldICSLine, type ICSEvent } from '../ics'

const FIXED_DTSTAMP = '2026-06-18T00:00:00Z'

describe('escapeICSText', () => {
  it('백슬래시 이스케이프', () => {
    expect(escapeICSText('a\\b')).toBe('a\\\\b')
  })
  it('쉼표 이스케이프', () => {
    expect(escapeICSText('a,b')).toBe('a\\,b')
  })
  it('세미콜론 이스케이프', () => {
    expect(escapeICSText('a;b')).toBe('a\\;b')
  })
  it('개행 이스케이프', () => {
    expect(escapeICSText('a\nb')).toBe('a\\nb')
  })
  it('일반 한국어 유지', () => {
    expect(escapeICSText('RSU 베스팅')).toBe('RSU 베스팅')
  })
  it('CRLF (Windows 줄종결) 정규화', () => {
    expect(escapeICSText('a\r\nb')).toBe('a\\nb')
  })
  it('단독 CR 정규화 (raw \\r 이 content line 종결자와 충돌 차단)', () => {
    expect(escapeICSText('a\rb')).toBe('a\\nb')
  })
  it('혼합 줄종결 모두 정규화', () => {
    expect(escapeICSText('a\r\nb\rc\nd')).toBe('a\\nb\\nc\\nd')
  })
})

describe('buildICS — 빈 events', () => {
  it('유효한 VCALENDAR 구조 반환', () => {
    const ics = buildICS([], { dtstamp: FIXED_DTSTAMP })
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('VERSION:2.0\r\n')
    expect(ics).toContain('PRODID:-//myFinance//Vesting Calendar//KO\r\n')
    expect(ics).not.toContain('BEGIN:VEVENT')
  })
})

describe('buildICS — CRLF 라인 종결', () => {
  it('모든 라인이 \\r\\n 으로 구분', () => {
    const ics = buildICS([
      { uid: 'a@x', summary: 'Test', date: '2026-06-15' },
    ], { dtstamp: FIXED_DTSTAMP })
    // LF only 라인 없음 (\r\n 외부의 단독 \n 0건)
    const lfOnly = ics.split('').filter((c, i) => c === '\n' && ics[i - 1] !== '\r').length
    expect(lfOnly).toBe(0)
    // 마지막 라인 종결 포함
    expect(ics.endsWith('\r\n')).toBe(true)
  })
})

describe('buildICS — 단일 종일 이벤트', () => {
  it('VEVENT 블록 생성 + DATE 형식', () => {
    const ev: ICSEvent = {
      uid: 'rsu-abc@myfinance.starryjeju.net',
      summary: '[RSU] 300주 베스팅',
      date: '2026-06-15',
    }
    const ics = buildICS([ev], { dtstamp: FIXED_DTSTAMP })
    expect(ics).toContain('BEGIN:VEVENT\r\n')
    expect(ics).toContain('UID:rsu-abc@myfinance.starryjeju.net\r\n')
    expect(ics).toContain('DTSTART;VALUE=DATE:20260615\r\n')
    expect(ics).toContain('SUMMARY:[RSU] 300주 베스팅\r\n')
    expect(ics).toContain('DTSTAMP:20260618T000000Z\r\n')
    expect(ics).toContain('END:VEVENT\r\n')
  })
})

describe('buildICS — 다중 이벤트', () => {
  it('events 순서 유지', () => {
    const ics = buildICS([
      { uid: 'a@x', summary: 'First', date: '2026-06-15' },
      { uid: 'b@x', summary: 'Second', date: '2026-07-20' },
    ], { dtstamp: FIXED_DTSTAMP })
    const firstIdx = ics.indexOf('First')
    const secondIdx = ics.indexOf('Second')
    expect(firstIdx).toBeGreaterThan(0)
    expect(secondIdx).toBeGreaterThan(firstIdx)
    expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(2)
    expect(ics.match(/END:VEVENT/g)?.length).toBe(2)
  })
})

describe('buildICS — DESCRIPTION 옵션', () => {
  it('description 있으면 DESCRIPTION 라인 포함', () => {
    const ics = buildICS([
      { uid: 'a@x', summary: 'Test', date: '2026-06-15', description: 'extra info' },
    ], { dtstamp: FIXED_DTSTAMP })
    expect(ics).toContain('DESCRIPTION:extra info\r\n')
  })
  it('description 없으면 DESCRIPTION 라인 생략', () => {
    const ics = buildICS([
      { uid: 'a@x', summary: 'Test', date: '2026-06-15' },
    ], { dtstamp: FIXED_DTSTAMP })
    expect(ics).not.toContain('DESCRIPTION:')
  })
})

describe('buildICS — 텍스트 이스케이프', () => {
  it('SUMMARY 의 콤마/세미콜론/백슬래시/개행 이스케이프', () => {
    const ics = buildICS([
      { uid: 'a@x', summary: 'a,b;c\\d\ne', date: '2026-06-15' },
    ], { dtstamp: FIXED_DTSTAMP })
    expect(ics).toContain('SUMMARY:a\\,b\\;c\\\\d\\ne\r\n')
  })
})

describe('buildICS — UID 안정성 (재호출 동일 결과)', () => {
  it('동일 입력 + 동일 dtstamp → 동일 출력', () => {
    const ev: ICSEvent = { uid: 'stable@x', summary: 'Test', date: '2026-06-15' }
    const a = buildICS([ev], { dtstamp: FIXED_DTSTAMP })
    const b = buildICS([ev], { dtstamp: FIXED_DTSTAMP })
    expect(a).toBe(b)
  })
})

describe('buildICS — 옵션 prodId / calName', () => {
  it('사용자 지정 prodId 적용', () => {
    const ics = buildICS([], {
      prodId: '-//Custom//Test//EN',
      calName: 'CustomCal',
      dtstamp: FIXED_DTSTAMP,
    })
    expect(ics).toContain('PRODID:-//Custom//Test//EN\r\n')
    expect(ics).toContain('X-WR-CALNAME:CustomCal\r\n')
  })
})

describe('foldICSLine — RFC 5545 §3.1', () => {
  it('75 octets 이하 — 그대로 반환', () => {
    const short = 'a'.repeat(75)
    expect(foldICSLine(short)).toBe(short)
  })
  it('75 초과 ASCII → CRLF + space 로 접기', () => {
    const line = 'a'.repeat(80)
    const folded = foldICSLine(line)
    expect(folded).toBe('a'.repeat(75) + '\r\n ' + 'a'.repeat(5))
  })
  it('연속 segments 도 75 octets 한계 준수 (leading space + 74)', () => {
    // 첫 75 + 연속(space + 74) + 연속(space + 1) = 총 150 bytes
    const line = 'a'.repeat(150)
    const folded = foldICSLine(line)
    expect(folded).toBe(
      'a'.repeat(75) + '\r\n ' + 'a'.repeat(74) + '\r\n ' + 'a'.repeat(1),
    )
    // 모든 물리 line 이 75 octets 이하인지 검증 (leading space 포함)
    const physicalLines = folded.split('\r\n')
    for (const pl of physicalLines) {
      expect(new TextEncoder().encode(pl).length).toBeLessThanOrEqual(75)
    }
  })
  it('한국어 multi-byte UTF-8 → boundary 보존하여 접기', () => {
    // 한국어 1자 = UTF-8 3 bytes. '가' × 30 = 90 bytes (75 초과)
    const line = '가'.repeat(30)
    const folded = foldICSLine(line)
    // 줄 접기 발생
    expect(folded).toContain('\r\n ')
    // multi-byte 문자가 잘리지 않음 — decode 했을 때 손상 없이 원본 복원
    const reassembled = folded.split('\r\n ').join('')
    expect(reassembled).toBe(line)
  })
  it('빈 문자열 — 그대로', () => {
    expect(foldICSLine('')).toBe('')
  })
})

describe('buildICS — 긴 SUMMARY/DESCRIPTION 자동 folding', () => {
  it('긴 한국어 description 도 RFC 5545 § 3.1 준수', () => {
    const ev: ICSEvent = {
      uid: 'long@x',
      summary: 'Test',
      date: '2026-06-15',
      description: '가'.repeat(50), // 150 bytes
    }
    const ics = buildICS([ev], { dtstamp: FIXED_DTSTAMP })
    // 75 octets 단위 fold 적용 → "DESCRIPTION:" + content 가 CRLF+space 로 접힘
    expect(ics).toMatch(/DESCRIPTION:[^\r]+\r\n /)
  })
})
