# 베스팅 캘린더 개선 1 — 요약/분포 강화

- **작성일**: 2026-06-30
- **타입**: enhancement (P2)
- **연관**: #307 (베스팅 캘린더 본체, 이미 완료)
- **참조**: `docs/designs/307-vesting-calendar/design-notes.md`

## 1. 배경

`/vesting` 페이지의 요약 strip 4 카드 + 면책 박스가 design-notes 의 의도와 차이가 있음:

| design-notes | 현재 |
|---|---|
| 이번 달 / 다가오는 90일 / **YTD 완료** / **만료 임박** | 이번 달 / 다가오는 90일 / 완료(전체) / 만료(이미 만료) |
| 다가오는 리스트 + **(계좌별 분포 + 면책 박스)** | 다가오는 리스트 + 면책 박스만 |

운영 시 가치 큰 정보 (옵션 행사 기회 D-90 임박, 계좌별 다가오는 부담 분포) 가 가려져 있음.

## 2. 요구사항

- [ ] **R1**: 완료 카드 — 전체 → **올해 (YTD) 완료** 만 카운트 (`event.date.startsWith(currentYear)`)
- [ ] **R2**: 만료 카드 → **만료 임박** 카드 — 옵션의 `expiryDate` 가 D-90 이내 + `remainingShares > 0` 인 옵션 수 (행사 기회 놓치기 직전 알림). 이미 만료된 항목은 별도 카운트 표시 가능.
- [ ] **R3**: **계좌별 분포** 카드 신설 — 다가오는 90일 events 를 `accountName` 별로 group + RSU/OPT 합산 주수. 세진/소담/다솜 컬러 차트 또는 stacked bar.
- [ ] **R4**: 면책 박스는 우측/하단에 유지.

## 3. 기술 설계

### 3.1 데이터 fetch 확장 (page.tsx)

기존:
```ts
const options = await prisma.stockOption.findMany({
  include: { account: ..., vestings: ... },
})
```

추가:
```ts
// 옵션의 expiryDate, remainingShares 도 함께 select (이미 모델에 있음 — select 누락만)
const options = await prisma.stockOption.findMany({
  include: {
    account: { select: { name: true } },
    vestings: { orderBy: { vestingDate: 'asc' } },
  },
  // expiryDate, remainingShares 는 default 로 포함됨 (Prisma findMany 는 모든 스칼라 default select)
})
```

→ 사실 `findMany` 는 기본적으로 모든 스칼라 필드 포함하므로 별도 수정 불필요. 그러나 spec 명시.

### 3.2 새 summary 계산

```ts
const currentYear = new Date().getUTCFullYear()
const EXPIRING_SOON_DAYS = 90

// R1: YTD 완료
const ytdCompletedCount = events.filter(
  (e) => (e.status === 'vested' || e.status === 'exercised') && e.date.startsWith(String(currentYear))
).length

// R2: 만료 임박 옵션
const expiringSoonCount = options.filter((opt) => {
  if (opt.remainingShares <= 0) return false
  const days = diffDaysKST(toKSTDateString(opt.expiryDate), todayMs)
  return days >= 0 && days <= EXPIRING_SOON_DAYS
}).length
const expiredCount = options.filter((opt) => {
  const days = diffDaysKST(toKSTDateString(opt.expiryDate), todayMs)
  return days < 0 && opt.remainingShares > 0
}).length  // 이미 만료 + 잔여수량 있음 = 행사 기회 영구 손실
```

### 3.3 계좌별 분포 (R3)

신규 컴포넌트 `src/components/vesting/VestingDistribution.tsx`:

```tsx
interface DistributionItem {
  accountName: string
  rsuShares: number
  optShares: number
  totalShares: number
  color: string  // sejin/sodam/dasom 컬러
}

// 입력: upcomingEvents (다가오는 90일)
// 출력: 계좌별 grouped row + stacked bar 또는 가로 비교
```

## 4. 변경 파일

- `src/app/vesting/page.tsx` — summary 4 카드 갱신 + VestingDistribution 추가
- `src/components/vesting/VestingDistribution.tsx` 신규
- `src/lib/vesting-events.ts` — `diffDaysKST` 헬퍼 export (현재 VestingList 내부에만 있음)

## 5. 테스트 계획

- `npm run lint && npx tsc --noEmit && npm run test:run && npm run build`
- 단위 테스트 (`src/lib/__tests__/vesting-events.test.ts`):
  - YTD 완료 카운트 (다른 연도 제외 확인)
  - 만료 임박 (D-90 경계 + remainingShares=0 제외)
- 수동: `/vesting` 페이지 — 모바일/데스크탑, 다가오는 90일 변동 시 분포 카드 갱신

## 6. 제외 사항

- light/dark 토글 (개선 2 별도 PR)
- 옵션 만료를 별도 VestingEvent 로 캘린더 셀에 표시 (별도 phase)
- 24-D vest_rsu (별도)
