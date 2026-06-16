# [Phase 25-G-4] 베스팅 캘린더

## 목적

RSU + 스톡옵션 베스팅 일정을 한 화면 월별 캘린더로 통합. 현재는 두 페이지를 따로 들어가서 리스트로만 확인 가능 → 다가오는 베스팅을 시각적으로 한눈에 파악하기 어렵다.

## 배경

- `RSUSchedule.vestingDate` 와 `StockOptionVesting.vestingDate` 가 동일 시간 차원 이벤트
- 이미 봇이 베스팅일 도래 시 자동 알림을 보내지만, 사용자가 사전에 일정을 가시화할 방법이 없음
- 사이드바의 "RSU" + "스톡옵션" 외에 통합 뷰가 빠져 있음

## 요구사항

- [ ] 신규 페이지 `/vesting`
- [ ] 사이드바 nav "포트폴리오" 그룹에 항목 추가 (📅 베스팅 캘린더)
- [ ] 월별 캘린더 그리드 컴포넌트 (`VestingCalendar`)
  - 전월/오늘/다음월 네비게이션
  - 일자별 이벤트 점/배지 (RSU=sejin 컬러, 스톡옵션=sodam 컬러)
  - 한 셀에 여러 이벤트 있으면 숫자 표시
  - 상태별 시각 구분 (pending/exercisable/vested/exercised/expired)
- [ ] 다가오는 90일 이벤트 리스트 컴포넌트 (`VestingList`)
- [ ] 이벤트 항목 클릭 시 RSU/스톡옵션 페이지로 네비게이트
- [ ] 모바일: 캘린더 셀 작게 + 리스트 우선 노출
- [ ] 단위 테스트 (`vesting-events` 헬퍼)

## 기술 설계

### 1. 데이터 통합 — `src/lib/vesting-events.ts`

```ts
export type VestingEventType = 'RSU' | 'OPTION'
export type VestingEventStatus =
  | 'pending'      // 미베스팅
  | 'exercisable'  // 베스팅 완료, 행사 가능 (옵션)
  | 'vested'       // RSU 베스팅 완료
  | 'exercised'    // 옵션 행사 완료
  | 'expired'      // 만료

export interface VestingEvent {
  id: string                     // 'rsu_xxx' | 'opt_xxx'
  type: VestingEventType
  date: string                   // YYYY-MM-DD (KST 기준)
  accountId: string
  accountName: string
  ticker: string | null          // RSU 는 null
  displayName: string            // RSU 는 'RSU' 또는 회사명
  shares: number
  status: VestingEventStatus
  link: string                   // '/rsu' | '/stock-options'
  meta?: {
    strikePrice?: number         // 옵션
    basisValue?: number          // RSU
  }
}

export function toVestingEvents(
  rsus: Array<{ id: string; vestingDate: Date; shares: number; accountId: string; account: { name: string }; status: string; basisValue: number }>,
  options: Array<{ id: string; ticker: string; displayName: string; strikePrice: number; vestings: Array<{ id: string; vestingDate: Date; shares: number; status: string }>; accountId: string; account: { name: string } }>
): VestingEvent[]

export function groupEventsByDate(events: VestingEvent[]): Map<string, VestingEvent[]>

export function upcomingEvents(events: VestingEvent[], days: number, now: Date): VestingEvent[]

// 캘린더 그리드용: month=0..11 기준 6주 x 7일 셀 배열
export function buildMonthGrid(year: number, month: number): Date[][]
```

### 2. 페이지 — `src/app/vesting/page.tsx` (server)

- Prisma 로 RSU/StockOption + vestings fetch
- `toVestingEvents()` 로 통합 → client component 에 전달
- Header, 면책 문구는 불필요 (캘린더 자체)

### 3. 컴포넌트 — `src/components/vesting/`

- `VestingCalendar.tsx` (client) — month state + grid 렌더
- `VestingList.tsx` (client) — 다가오는 90일 events, today highlight
- `VestingEventBadge.tsx` — 색상/상태 뱃지 (RSU/OPTION + status)

### 4. 사이드바 추가 — `nav-config.ts`

```ts
{ href: '/vesting', icon: '📅', label: '베스팅 캘린더' }
```
"포트폴리오" 그룹 RSU/스톡옵션 사이.

### 5. KST 시간대

캘린더는 사용자 로컬(KST) 기준. `Date` 객체를 KST 캘린더 날짜 문자열 (`YYYY-MM-DD`) 로 변환하는 헬퍼는 25-C 에서 만든 `toKSTDateString` 패턴 재사용 또는 vesting-events.ts 내부 동일 헬퍼.

### 6. 단위 테스트 (`__tests__/vesting-events.test.ts`)

- `toVestingEvents`: RSU+OPTION 통합 결과 길이, 정렬, status 매핑
- `groupEventsByDate`: 같은 날 이벤트 묶임
- `upcomingEvents`: 오늘부터 N일 안 이벤트만 필터
- `buildMonthGrid`: 정확한 6주 x 7일, 인접월 셀 포함

## 테스트 계획

- `npm run lint && npx tsc --noEmit && npm run test:run && npm run build`
- 수동 회귀:
  - 빈 데이터 (이벤트 없음) — "다가오는 베스팅이 없습니다" 표시
  - 같은 날 RSU + 옵션 동시 — 캘린더 셀에 둘 다 표시
  - 모바일 (375px) 레이아웃
  - light/dark 토글
- 단위 테스트 6+ 케이스

## 제외 사항

- 캘린더에서 베스팅 수정/실행 — RSU/스톡옵션 페이지로 이동
- iCal / Google Calendar 내보내기 — 별도 phase
- 베스팅 알림 자체 — 봇 스케줄러가 이미 처리
- 주간(week) / 일간(day) 뷰 — 월간만 충분
