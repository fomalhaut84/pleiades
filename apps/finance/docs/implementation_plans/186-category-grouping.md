# 16-C2: 카테고리 그루핑 — 구현 계획

## 변경 파일 목록

### 신규
- `prisma/migrations/xxx_category_group/` — 마이그레이션
- `src/app/api/category-groups/route.ts` — GET, POST
- `src/app/api/category-groups/[id]/route.ts` — PUT, DELETE
- `src/components/category/CategoryGroupManager.tsx` — 그룹 관리 카드 그리드

### 수정
- `prisma/schema.prisma` — CategoryGroup 모델, Category.groupId, Budget.groupId
- `src/app/api/categories/route.ts` — 응답에 group 정보 포함
- `src/app/api/categories/[id]/route.ts` — PUT에 groupId 지원
- `src/app/api/budgets/route.ts` — 그룹별 예산 조회/upsert
- `src/components/category/CategoryTable.tsx` — 그룹별 헤더 + 접기/펼치기
- `src/components/category/CategoryEditPanel.tsx` — 그룹 select 추가
- `src/components/category/CategoryForm.tsx` — 그룹 select 추가
- `src/app/categories/page.tsx` — 그룹 관리 섹션 추가
- `src/components/expense/BudgetManager.tsx` — 그룹별 예산 행
- `src/components/expense/CategoryPieChart.tsx` — 그룹별 토글

## 패키지 추가
없음

## DB 마이그레이션
- CategoryGroup 모델 신규 (name unique, icon, sortOrder)
- Category에 groupId FK (optional)
- Budget에 groupId FK (optional)
- 데이터 마이그레이션: 10개 그룹 생성 + 41개 카테고리에 groupId 배정

## 디자인 참조
- `docs/designs/186-category-grouping/prototype.html` (승인 완료)

## 구현 순서

### Step 1: Prisma 스키마 + 마이그레이션
- CategoryGroup 모델: id, name(@unique), icon, sortOrder, categories[], budgets[]
- Category: groupId String? + group CategoryGroup? @relation
- Budget: groupId String? + group CategoryGroup? @relation
- SQL 데이터 마이그레이션: 10개 그룹 INSERT + 기존 카테고리 UPDATE SET groupId

### Step 2: CategoryGroup CRUD API
- GET /api/category-groups: 그룹 목록 + _count.categories
- POST /api/category-groups: 그룹 생성 (name, icon, sortOrder)
- PUT /api/category-groups/[id]: 수정
- DELETE /api/category-groups/[id]: 삭제 (카테고리 있으면 400)

### Step 3: Category API 확장
- GET /api/categories: 응답에 groupId, group.name, group.icon 포함
- PUT /api/categories/[id]: groupId 수정 지원

### Step 4: Budget API 확장
- GET /api/budgets: groupBudgets 추가 (그룹별 예산 + 하위 카테고리 소비 합산)
- POST /api/budgets: groupId로 upsert 지원 (@@unique에 groupId 추가 필요)

### Step 5: 카테고리 페이지 UI
- CategoryTable: 그룹 헤더 행 (접기/펼치기) + 카테고리 들여쓰기
- CategoryEditPanel/CategoryForm: 그룹 select 드롭다운 추가
- CategoryGroupManager: 카드 그리드 + 인라인 추가/수정/삭제
- page.tsx: 그룹 관리 섹션 추가 (테이블 위 또는 별도 탭)

### Step 6: 예산 페이지 UI
- BudgetManager: 그룹별 예산 행 (접기/펼치기 + 하위 카테고리 소비)
- 그룹 예산 인라인 편집

### Step 7: 가계부 페이지 UI
- CategoryPieChart: "카테고리별 | 그룹별" 토글 추가
- 그룹별 모드: 카테고리를 그룹으로 합산
