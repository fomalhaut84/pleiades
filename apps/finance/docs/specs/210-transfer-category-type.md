# 이체(transfer) 카테고리 타입 추가

## 목적

출금/입금(이체) 거래에 적합한 카테고리를 제공한다.
현재 카테고리 type은 "expense"/"income"만 존재하여,
적금 이체·투자계좌 입금 등의 거래에 맞는 카테고리가 없다.

## 요구사항

- [ ] Category type에 "transfer" 추가 (DB String 타입이라 마이그레이션 불필요)
- [ ] 기본 transfer 카테고리 시드 추가 (적금, 예금, 투자계좌, 기타이체 등)
- [ ] TransactionForm: transfer 유형 선택 시 transfer 카테고리만 표시
- [ ] 카테고리 관리 UI/API: transfer 타입 생성·수정 지원
- [ ] 후잉 매핑 UI: transfer 그룹 표시
- [ ] 기존 소비/수입 기능 회귀 없음

## 기술 설계

### 변경 불필요 (정상 동작)
- 차트/분석: expense/income만 집계 → transfer 제외가 올바른 동작
- 예산: expense 카테고리만 대상 → transfer 무관
- 가계부 필터(all/소비/수입): transfer는 "전체"에서만 표시
- 텔레그램 봇: expense/income 입력만 지원 → transfer 무관

### 변경 파일

1. **`prisma/seed.ts`** — transfer 카테고리 시드 추가
2. **`src/app/api/categories/route.ts`** — POST 유효성에 "transfer" 허용
3. **`src/app/api/categories/[id]/route.ts`** — PUT 유효성에 "transfer" 허용
4. **`src/components/expense/TransactionForm.tsx`** — transfer 유형 시 transfer 카테고리 표시
5. **`src/components/category/CategoryEditPanel.tsx`** — transfer 타입 옵션 추가
6. **`src/components/category/CategoryClient.tsx`** — transfer 탭/필터 추가
7. **`src/components/settings/WhooingSettings.tsx`** — transfer 그룹 표시
8. **`src/components/expense/RecurringForm.tsx`** — transfer 카테고리 그룹 표시 (반복거래도 이체 가능)

## 테스트 계획

- [ ] TransactionForm에서 출금/입금 선택 시 transfer 카테고리만 표시
- [ ] 카테고리 관리에서 transfer 타입 생성·수정·삭제 가능
- [ ] 후잉 설정에서 transfer 그룹 매핑 가능
- [ ] 기존 소비/수입 차트·분석·예산 정상 동작 (회귀)
- [ ] lint + typecheck + build 통과

## 제외 사항

- transfer 거래 로직 자체 변경 없음 (이미 동작 중)
- 가계부 필터에 "이체" 탭 추가하지 않음 (전체 탭에서 보임)
- 텔레그램 봇 이체 입력 지원하지 않음
