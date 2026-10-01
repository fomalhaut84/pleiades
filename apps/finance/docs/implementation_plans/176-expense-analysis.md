# 16-D: 가계부 분석 강화 — 구현 계획

## 변경 파일 목록

### 신규
- `src/app/api/transactions/analysis/route.ts` — 분석 전용 API (전월 대비 + 트렌드)
- `src/components/expense/MonthCompare.tsx` — 전월 대비 그룹별 변동 테이블
- `src/components/expense/SpendingTrend.tsx` — 지출 트렌드 차트/테이블 (Recharts LineChart)

### 수정
- `src/components/expense/ExpenseSummary.tsx` — 전월 대비 뱃지 추가
- `src/app/expenses/ExpensesClient.tsx` — 분석 섹션 추가, 분석 API 호출

## 패키지 추가
없음 (Recharts 이미 설치됨)

## DB 마이그레이션
없음

## 디자인 참조
- `docs/designs/176-expense-analysis/prototype.html` (승인 완료)

## 구현 순서

### Step 1: 분석 API
- GET /api/transactions/analysis?year=2026&month=3
- 응답: { monthCompare: { groups: [...], prevMonth }, trend: { months: [...], groups: [...] } }
- 전월 대비: 해당 월 + 전월 카테고리별 소비 → 그룹별 합산 → 증감 계산
- 트렌드: 최근 6개월 카테고리별 소비 → 그룹별 합산 → 평균 + 이상치 판정

### Step 2: ExpenseSummary 확장
- Props에 prevMonth 데이터 추가 (optional)
- 각 카드 하단에 전월 대비 뱃지 (▲/▼/—)
- month 미선택 시 뱃지 숨김

### Step 3: MonthCompare.tsx
- 그룹별 이번 달 vs 전월 비교 테이블
- 증감 절대값 내림차순 정렬
- 색상: 증가=빨강, 감소=초록

### Step 4: SpendingTrend.tsx
- Recharts LineChart: 그룹별 라인 (상위 5개)
- 기간 토글: 3개월 / 6개월
- 차트/테이블 뷰 토글
- 이상 지출: 평균 150%+ → 빨간 dot

### Step 5: ExpensesClient 통합
- 분석 API 호출 (월 선택 시)
- MonthCompare, SpendingTrend 렌더링
- 레이아웃: 기존 차트 아래, 내역 테이블 위
