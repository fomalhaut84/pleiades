# [Phase 26-F] 베스팅 캘린더 iCal 내보내기 (RFC 5545)

## 목적

RSU + 스톡옵션 베스팅 일정을 ICS 표준 파일로 내보내, 사용자가 Google Calendar / Apple Calendar / Outlook 에 import 할 수 있게 한다. 25-G-4 에서 만든 `/vesting` 페이지의 외부 호환성 확장.

## 배경

- 이미 `src/lib/vesting-events.ts` 에 `toVestingEvents()` 헬퍼 존재 (RSU + 옵션 통합)
- `/vesting` 페이지는 화면 내 캘린더 + 90일 리스트만 제공 → 외부 캘린더 도구 연동 불가
- RFC 5545 (ICS) 는 모든 주요 캘린더 도구가 지원하는 표준 포맷

## 요구사항

- [ ] `src/lib/ics.ts` 신규 — RFC 5545 직렬화 헬퍼
  - `buildICS(events: ICSEvent[], opts?): string`
  - CRLF 라인 종결, 종일 이벤트 형식, 텍스트 이스케이프
- [ ] `GET /api/exports/vesting.ics` 신규 라우트
  - Prisma fetch (`prisma.rSUSchedule`, `prisma.stockOption` + vestings)
  - `toVestingEvents` → ICS 변환
  - `text/calendar; charset=utf-8` MIME + `Content-Disposition: attachment`
- [ ] `/vesting` 페이지 다운로드 버튼
- [ ] 단위 테스트 (`__tests__/ics.test.ts`)
  - VCALENDAR/VEVENT 구조, CRLF, 종일 이벤트, 이스케이프, 빈 events, UID 안정성

## 기술 설계

### 1. ICS 이벤트 매핑

| 모델 | SUMMARY | DTSTART (KST 캘린더 날짜) | UID | 비고 |
|---|---|---|---|---|
| RSU 베스팅 | `[RSU] {shares}주 베스팅` | YYYYMMDD | `rsu-{id}@myfinance.starryjeju.net` | 종일 |
| 옵션 베스팅 (pending/exercisable) | `[Option] {ticker} {shares}주 베스팅` | YYYYMMDD | `opt-vest-{id}@...` | 종일 |
| 옵션 만료 (`expiryDate`) | `[Option 만료] {ticker}` | YYYYMMDD | `opt-expire-{id}@...` | 종일 |

**제외**:
- 옵션 상태 = `exercised` / `expired` (이미 종료)
- 옵션 만료 이벤트는 별도 fetch (vesting-events 외 — `expiryDate` 직접 활용)

### 2. ICS 헬퍼 인터페이스

```ts
// src/lib/ics.ts
export interface ICSEvent {
  uid: string                  // 안정된 식별자
  summary: string
  date: string                 // YYYY-MM-DD (KST 캘린더)
  description?: string
}

export interface BuildICSOptions {
  prodId?: string              // 기본 '-//myFinance//Vesting Calendar//KO'
  calName?: string             // 기본 'myFinance 베스팅'
  dtstamp?: string             // 기본 현재 UTC (YYYYMMDDTHHMMSSZ)
}

export function buildICS(events: ICSEvent[], opts?: BuildICSOptions): string
```

**핵심 동작**:
- CRLF (`\r\n`) 라인 종결 — RFC 5545 필수
- 종일 이벤트: `DTSTART;VALUE=DATE:20260615`
- 텍스트 필드 이스케이프: `\` → `\\`, `,` → `\,`, `;` → `\;`, `\n` → `\n` (리터럴)
- 라인 길이 75 octet 초과 시 줄바꿈 (간단화: 일단 미적용, 한국어 SUMMARY 75자 거의 안 넘음 — TODO 후속)

### 3. 라우트

```ts
// src/app/api/exports/vesting.ics/route.ts
export async function GET() {
  const [rsus, options] = await prisma.$transaction([...])
  const events = toVestingEvents(rsus, options)
  const icsEvents = events
    .filter(e => e.status !== 'exercised' && e.status !== 'expired')
    .map(e => ({
      uid: `${e.id}@myfinance.starryjeju.net`,
      summary: e.type === 'RSU'
        ? `[RSU] ${e.shares}주 베스팅`
        : `[Option] ${e.ticker} ${e.shares}주 베스팅`,
      date: e.date,
    }))
  // 옵션 만료 별도 추가
  for (const opt of options) {
    icsEvents.push({
      uid: `opt-expire-${opt.id}@...`,
      summary: `[Option 만료] ${opt.ticker}`,
      date: toKSTDateString(opt.expiryDate),
    })
  }
  const ics = buildICS(icsEvents)
  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="vesting.ics"',
    },
  })
}
```

### 4. UI

```tsx
// src/app/vesting/page.tsx 헤더 영역
<Header title="베스팅 캘린더">
  <a
    href="/api/exports/vesting.ics"
    download="vesting.ics"
    className="..."
  >
    📅 내보내기
  </a>
</Header>
```

### 5. UID 안정성

- 동일 RSU/옵션 베스팅 = 동일 UID
- 캘린더 도구가 재import 시 중복 추가 대신 업데이트
- UID = DB primary key + 고정 도메인

## 테스트 계획

- `npm run lint && npx tsc --noEmit && npm run test:run && npm run build`
- 단위 테스트 (~10 케이스):
  - 빈 events
  - 단일 이벤트
  - 다중 이벤트
  - 텍스트 이스케이프 (콤마, 세미콜론, 백슬래시, 개행)
  - CRLF 검증
  - 종일 이벤트 DATE 형식
  - 동일 입력 = 동일 출력 (UID 안정성)
- 수동 회귀:
  - `.ics` 다운로드 → Google Calendar / Apple Calendar import
  - 이벤트 종일 표시 확인
  - UID 동일하므로 재import 시 중복 안 생김

## 제외 사항

- **URL 구독** (webcal://, ICS feed 자동 갱신) — 정적 다운로드만 1차
- **양방향 동기화** (Google Calendar API)
- 라인 길이 75 octet 자동 줄바꿈 (한국어 SUMMARY 60자 미만이라 실용 불필요)
- VALARM (알림) — 이미 봇 스케줄러가 처리
- 사용자 인증 / 토큰 (personal use)
- 베스팅 외 이벤트 (배당 지급일 등)
