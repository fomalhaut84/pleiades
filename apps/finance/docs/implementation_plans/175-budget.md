# 16-C: 예산 API + UI — 구현 계획

## 변경 파일 목록

### 신규
- `src/lib/budget-utils.ts` — 예산 입력 검증
- `src/app/api/budgets/route.ts` — GET + POST (upsert + copy)
- `src/app/api/budgets/[id]/route.ts` — DELETE
- `src/components/expense/BudgetProgress.tsx` — 전체 예산 요약 카드
- `src/components/expense/BudgetManager.tsx` — 카테고리별 예산 관리 + 복사 모달
- `src/app/budgets/page.tsx` — 예산 페이지 (BudgetsClient 포함)

### 수정
- `src/components/layout/nav-config.ts` — 가계부 그룹에 "예산" 추가

## 패키지 추가
없음

## DB 마이그레이션
없음 (Budget 모델 이미 존재, @@unique([categoryId, year, month]))

## 디자인 참조
- `docs/designs/175-budget/prototype.html` (승인 완료)
- `docs/designs/175-budget/design-notes.md`

## 구현 순서

### Step 1: budget-utils.ts — 입력 검증
- `validateBudgetInput(body)`: amount(양의 정수, 상한 2^31-1), year(1900~2100), month(1~12)
- categoryId: 선택 (null이면 전체 예산)

### Step 2: GET /api/budgets — 예산 목록 + 소비 합산
- Query: year, month (필수)
- 전체 예산 (categoryId=null) + 카테고리별 예산 조회
- 해당 월 카테고리별 소비 aggregate → 예산과 조인
- 응답: { totalBudget, categoryBudgets: [{ budget, spent, remaining, pct }] }

### Step 3: POST /api/budgets — upsert + copy
- body: { categoryId?, year, month, amount }
- Prisma upsert (@@unique 제약 활용)
- POST /api/budgets/copy: { sourceYear, sourceMonth, targetYear, targetMonth }
  - 소스 월의 모든 예산을 타겟 월에 upsert

### Step 4: DELETE /api/budgets/[id]
- P2025 catch → 404

### Step 5: BudgetProgress.tsx — 전체 예산 요약 카드
- Props: totalBudget, totalSpent
- 대형 금액, 소비/잔여, 프로그레스 바 (색상 단계: <70% 초록, 70~100% 노랑, >100% 빨강)
- "금액 수정" → 인라인 입력 → POST /api/budgets (categoryId=null)

### Step 6: BudgetManager.tsx — 카테고리별 예산 테이블
- Props: categoryBudgets, categories, onRefresh
- 각 행: 카테고리 아이콘+이름, 진행률 바, 소비액, 잔여액, 액션
- 인라인 편집: 연필 클릭 → 금액 입력 → 저장/취소
- 삭제: DELETE /api/budgets/[id]
- "+ 카테고리 예산 추가": 카테고리 select + 금액 입력
- "예산 복사" 모달: 현재 월 예산 목록 → 다음 달 복사 확인

### Step 7: budgets/page.tsx — 예산 페이지
- 서버: 현재 월 예산 데이터 fetch
- 클라이언트: 월 네비게이션 (prev/next), BudgetProgress, BudgetManager
- nav-config에 "예산" 메뉴 추가 (가계부 그룹)
