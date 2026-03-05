# 구현 계획 — Issue #2 레이아웃 + 대시보드 UI

## 참조 문서

- 스펙: `docs/specs/2-layout-dashboard-ui.md`
- 디자인: `docs/designs/2-layout-dashboard-ui/prototype.html`
- 디자인 노트: `docs/designs/2-layout-dashboard-ui/design-notes.md`

## 패키지 추가

```bash
npm install recharts
```

Recharts는 클라이언트 컴포넌트에서 파이차트 렌더링에 사용.

## DB 마이그레이션

없음. 기존 스키마 그대로 사용.

## 구현 순서

### Phase A: 기반 설정 (Tailwind + 폰트 + 글로벌 스타일)

| # | 파일 | 작업 |
|---|------|------|
| 1 | `tailwind.config.ts` | 커스텀 컬러 추가 (bg, card, border, dim, sub, text, bright, sejin, sodam, dasom) |
| 2 | `src/app/globals.css` | 다크 테마 CSS 변수, Pretendard 폰트 import, body 기본 스타일 |
| 3 | `src/lib/format.ts` | `formatKRW()`, `formatUSD()` 유틸리티 함수 |

### Phase B: 레이아웃 컴포넌트

| # | 파일 | 작업 |
|---|------|------|
| 4 | `src/components/layout/Sidebar.tsx` | 사이드바 (데스크톱), 클라이언트 컴포넌트 (active 상태 관리) |
| 5 | `src/components/layout/BottomTab.tsx` | 하단 탭 바 (모바일), 클라이언트 컴포넌트 |
| 6 | `src/components/layout/Header.tsx` | 상단 헤더 (페이지 제목 + 서브 텍스트) |
| 7 | `src/app/layout.tsx` | RootLayout에 Sidebar + BottomTab + Header 통합, Pretendard 폰트 적용 |

### Phase C: 공통 UI 컴포넌트

| # | 파일 | 작업 |
|---|------|------|
| 8 | `src/components/ui/Card.tsx` | 범용 카드 (glow, hover, clickable 옵션) |

### Phase D: 대시보드 메인 페이지

| # | 파일 | 작업 |
|---|------|------|
| 9 | `src/components/dashboard/FamilyTotalCard.tsx` | 전체 합산 카드 (3계좌 금액 포함) |
| 10 | `src/components/dashboard/AccountSummaryCard.tsx` | 계좌별 요약 카드 (이름, 전략, 금액, 종목수) |
| 11 | `src/app/page.tsx` | 대시보드 페이지 (서버 컴포넌트, Prisma 직접 조회) |

### Phase E: 계좌 상세 페이지

| # | 파일 | 작업 |
|---|------|------|
| 12 | `src/components/dashboard/HoldingsTable.tsx` | 보유종목 테이블 (종목명, 시장, 수량, 평균단가, 매입금) |
| 13 | `src/components/dashboard/AllocationChart.tsx` | 매입비중 파이차트 (Recharts PieChart, 클라이언트 컴포넌트) |
| 14 | `src/app/accounts/[id]/page.tsx` | 계좌 상세 페이지 (서버 컴포넌트, Prisma 직접 조회) |

## 파일별 상세

### `tailwind.config.ts`

```typescript
// theme.extend.colors에 추가
colors: {
  bg: '#07080c',
  'bg-raised': '#0d0e14',
  dim: '#6e6e82',
  sub: '#9494a8',
  muted: '#c8c8d4',
  bright: '#eeeef2',
  sejin: '#34d399',
  sodam: '#60a5fa',
  dasom: '#fb923c',
}
```

### `src/lib/format.ts`

```typescript
export function formatKRW(amount: number): string
  // → "1,234,567원"
export function formatUSD(amount: number): string
  // → "$123.45"
```

### `src/app/page.tsx` (서버 컴포넌트)

```typescript
// Prisma 직접 조회 (API route 불필요)
const accounts = await prisma.account.findMany({
  include: {
    holdings: { orderBy: { avgPrice: 'desc' } },
    _count: { select: { holdings: true } },
  },
  orderBy: { createdAt: 'asc' },
})

// 각 계좌 매입금 합산 계산
// holding.currency === 'USD' → avgPrice * shares * avgFxRate
// holding.currency === 'KRW' → avgPrice * shares
```

### `src/app/accounts/[id]/page.tsx` (서버 컴포넌트)

```typescript
// Prisma 직접 조회
const account = await prisma.account.findUnique({
  where: { id: params.id },
  include: {
    holdings: { orderBy: { avgPrice: 'desc' } },
    deposits: true,
  },
})
// 404 → notFound()
```

### `AllocationChart.tsx` (클라이언트 컴포넌트)

```typescript
'use client'
// Recharts PieChart + Pie (도넛: innerRadius, outerRadius)
// 종목별 컬러: 미리 정의된 팔레트에서 순서대로 배정
// 범례: 차트 아래 수직 리스트
```

## 계좌별 매입금 계산 로직

```typescript
function calcCostKRW(holding: Holding): number {
  if (holding.currency === 'USD') {
    return Math.round(holding.avgPrice * holding.shares * (holding.avgFxRate ?? 1450))
  }
  return Math.round(holding.avgPrice * holding.shares)
}
```

## 검증 체크리스트

- [ ] `npm run lint` 통과
- [ ] `npm run build` 통과
- [ ] `/` 접속 → 3개 계좌 카드 + Family Total 표시
- [ ] 계좌 카드 클릭 → `/accounts/[id]` 이동
- [ ] 계좌 상세 보유종목 테이블 정상
- [ ] 파이차트 정상 렌더링
- [ ] 금액 포맷 정상 (KRW 콤마, USD $)
- [ ] 모바일 반응형 (사이드바→탭바)
- [ ] 다크 테마 적용
- [ ] 고해상도 디스플레이 가독성
