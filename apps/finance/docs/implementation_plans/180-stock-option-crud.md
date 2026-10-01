# 17-C: 스톡옵션 CRUD — 구현 계획

## 변경 파일 목록

### 신규
- `src/app/api/stock-options/[id]/route.ts` — PUT, DELETE
- `src/app/api/stock-options/[id]/vestings/route.ts` — POST (스케줄 추가)
- `src/app/api/stock-options/[id]/vestings/[vid]/route.ts` — PUT, DELETE
- `src/components/stock-option/StockOptionForm.tsx` — 추가/수정 패널
- `src/components/stock-option/StockOptionDeleteModal.tsx` — 삭제 모달

### 수정
- `src/app/api/stock-options/route.ts` — POST 추가
- `src/components/stock-option/StockOptionDashboard.tsx` — CRUD 버튼 + 폼/모달
- `src/app/stock-options/page.tsx` — accounts 전달

## 구현 순서

### Step 1: StockOption API (POST/PUT/DELETE)
### Step 2: Vesting API (POST/PUT/DELETE)
### Step 3: StockOptionForm + DeleteModal
### Step 4: StockOptionDashboard 확장
