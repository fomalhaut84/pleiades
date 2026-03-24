# 16-B: 거래 웹 UI + 네비게이션 개편 + 용어 정리 — 구현 계획

## 변경 파일 목록

### 신규
- `src/components/expense/TransactionForm.tsx` — 내역 추가/수정 슬라이드 패널
- `src/components/expense/TransactionDeleteModal.tsx` — 삭제 확인 모달

### 수정
- `src/components/layout/nav-config.ts` — 네비게이션 구조 개편 + 용어 변경
- `src/components/expense/TransactionTable.tsx` — 액션 컬럼(수정/삭제 버튼) 추가
- `src/app/expenses/ExpensesClient.tsx` — 추가 버튼, 폼/모달 통합, refetch
- 모바일 하단 탭 관련 컴포넌트 — "거래"→"종목 거래", "세금"→"가계부"

## 패키지 추가
없음

## DB 마이그레이션
없음

## 디자인 참조
- `docs/designs/174-transaction-web-ui/prototype.html` (승인 완료)
- `docs/designs/174-transaction-web-ui/design-notes.md`

## 구현 순서

### Step 1: nav-config.ts — 네비게이션 개편
- 4개 그룹: 포트폴리오(종목 거래), 가계부(가계부+카테고리), 분석, AI&전략
- "거래" 라벨 → "종목 거래"
- "가계부" 그룹 신설 (가계부 + 카테고리를 분석에서 분리)
- 모바일 하단 탭 관련 컴포넌트 수정

### Step 2: TransactionForm.tsx — 내역 추가/수정 폼
- CategoryForm 패턴 재사용 (우측 슬라이드 패널 420px)
- Props: mode('create'|'edit'), transaction?(수정 대상), categories(select 목록), onClose, onSaved
- 필드: 금액(number), 내용(text), 카테고리(select optgroup 소비/수입), 날짜(date)
- 소비/수입: 카테고리 type에 따라 자동 결정
- create → POST /api/transactions, edit → PUT /api/transactions/[id]
- 성공 시 onSaved 콜백 → 부모에서 refetch

### Step 3: TransactionDeleteModal.tsx — 삭제 확인 모달
- CategoryDeleteModal 패턴 재사용 (중앙 모달 + backdrop)
- Props: transaction(삭제 대상), onClose, onDeleted
- 정보 카드: 날짜, 카테고리(아이콘+이름), 내용, 금액
- DELETE /api/transactions/[id] 호출
- 성공 시 onDeleted 콜백

### Step 4: TransactionTable.tsx — 액션 컬럼 추가
- 신규 props: onEdit(tx), onDelete(tx) 콜백
- 테이블 헤더에 "액션" 컬럼 추가
- 각 행에 수정(연필 SVG) + 삭제(휴지통 SVG) 아이콘 버튼
- 삭제 hover: red-dim 배경
- 제목: "최근 거래 내역" → "최근 가계부 내역"

### Step 5: ExpensesClient.tsx — 통합
- 카테고리 목록 fetch (TransactionForm select용)
- 상태: showForm, editingTx, deletingTx
- "+ 내역 추가" 버튼 → showForm = true
- 테이블 onEdit → editingTx 설정, onDelete → deletingTx 설정
- TransactionForm, TransactionDeleteModal 조건부 렌더링
- CRUD 완료 시 fetchData로 전체 refetch

### Step 6: 모바일 하단 탭
- 관련 레이아웃 컴포넌트에서 하단 탭 텍스트/아이콘 변경
- "거래" → "종목 거래", "세금" → "가계부"
