# [Phase 1] 레이아웃 + 대시보드 UI

## 목적

기본 레이아웃(사이드바, 계좌 탭, 다크 테마)을 구성하고, 대시보드 메인 페이지와 계좌 상세 페이지를 만든다. Phase 1에서는 매입 데이터 기준으로 표시 (실시간 주가는 Phase 2).

## 요구사항

### 기본 레이아웃
- [ ] 사이드바 네비게이션 (대시보드, 계좌별 링크)
- [ ] 다크 테마 기본 (Tailwind dark mode)
- [ ] 모바일: 사이드바 → 하단 탭 바 또는 햄버거 메뉴
- [ ] 상단 헤더 (앱 타이틀, 현재 페이지명)
- [ ] 디자인 참조: `docs/examples/dashboard-prototype.jsx`

### 대시보드 메인 페이지 (`/`)
- [ ] 계좌별 요약 카드 3장 (세진/소담/다솜)
  - 계좌명, 전략, 보유종목 수
  - 총 매입금 (KRW 합산)
  - 종목 비중 미니 차트 또는 요약
- [ ] 전체 포트폴리오 요약 (3계좌 합산 매입금)
- [ ] 계좌 카드 클릭 → 계좌 상세 페이지 이동

### 계좌 상세 페이지 (`/accounts/[id]`)
- [ ] 보유종목 테이블
  - 종목명(displayName), 시장(US/KR), 수량, 평균단가, 매입금, 통화
  - 정렬: 매입금 기준 내림차순
- [ ] 매입비중 파이차트 (Recharts)
  - 종목별 매입금 비중
  - 색상: 종목별 자동 배정 (계좌 컬러와 별개)
- [ ] 계좌 정보 헤더 (계좌명, 전략, 투자기간)
- [ ] 금액 표시 규칙:
  - KRW: `toLocaleString('ko-KR')` + "원"
  - USD: `$` + 소수점 2자리
- [ ] 차트 컬러: 세진=#34d399, 소담=#60a5fa, 다솜=#fb923c

### 공통 UI 컴포넌트
- [ ] Card 컴포넌트
- [ ] 금액 포맷 유틸리티 (`formatKRW`, `formatUSD`)

## 기술 설계

### 페이지 구조

```
src/app/
├── layout.tsx              → RootLayout (Sidebar + Header + main)
├── page.tsx                → 대시보드 (서버 컴포넌트, DB 직접 조회)
└── accounts/
    └── [id]/
        └── page.tsx        → 계좌 상세 (서버 컴포넌트)
```

### 컴포넌트 구조

```
src/components/
├── ui/
│   └── Card.tsx
├── layout/
│   ├── Sidebar.tsx
│   └── Header.tsx
└── dashboard/
    ├── AccountSummaryCard.tsx   → 계좌 요약 카드
    ├── HoldingsTable.tsx        → 보유종목 테이블
    └── AllocationChart.tsx      → 매입비중 파이차트
```

### 데이터 조회

서버 컴포넌트에서 Prisma 직접 조회 (API route 경유 불필요):

```typescript
// app/page.tsx (서버 컴포넌트)
const accounts = await prisma.account.findMany({
  include: { holdings: true }
})
```

### Phase 1 표시 한계

- "현재가" 컬럼: Phase 2에서 추가 (Phase 1에서는 표시 안 함 또는 "—")
- "평가손익" / "수익률": Phase 2에서 추가
- "환차손익": Phase 2에서 추가

## 테스트 계획

- [ ] `/` 접속 시 3개 계좌 카드 표시
- [ ] 계좌 카드 클릭 → `/accounts/[id]` 이동
- [ ] 계좌 상세에서 보유종목 테이블 표시
- [ ] 파이차트 정상 렌더링
- [ ] 금액 포맷 정상 (KRW 콤마, USD 달러 표시)
- [ ] 모바일 반응형 동작
- [ ] 다크 테마 적용
- [ ] `npm run lint` + `npm run build` 통과

## 제외 사항

- 실시간 주가 표시 (Phase 2)
- 거래 입력 폼 (Phase 3)
- 세금 대시보드 (Phase 4)
- 라이트 모드 토글 (Phase 6)
