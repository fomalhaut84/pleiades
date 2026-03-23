# 16-F: 가계부 자산 연동 — 구현 계획

## 변경 파일 목록

### 신규
- `prisma/migrations/xxx_transaction_asset_link/` — 마이그레이션

### 수정
- `prisma/schema.prisma` — Transaction에 type, linkedAssetId 추가
- `src/lib/transaction-utils.ts` — transfer 유형 검증 추가
- `src/app/api/transactions/route.ts` — POST에 transfer 처리 + Asset 업데이트
- `src/app/api/transactions/[id]/route.ts` — PUT에 자산 역산+재적용, DELETE에 자산 역산
- `src/components/expense/TransactionForm.tsx` — 유형 세그먼트 + 자산 select + 임팩트 미리보기
- `src/components/expense/TransactionTable.tsx` — transfer 뱃지 표시
- `src/app/expenses/ExpensesClient.tsx` — Asset 목록 fetch
- `src/lib/whooing-webhook.ts` — transfer 유형 매핑

## 패키지 추가
없음

## DB 마이그레이션
- Transaction: type String? 추가, linkedAssetId String? 추가 + FK

## 디자인 참조
- `docs/designs/187-asset-link/prototype.html` (승인 완료)

## 구현 순서

### Step 1: Prisma 스키마 + 마이그레이션
- Transaction에 type(String?), linkedAssetId(String?) + Asset relation 추가
- type null = 기존 동작 (카테고리 type 사용)

### Step 2: transaction-utils 확장
- transfer 유형 검증: linkedAssetId 필수
- type 유효값: null, "transfer_out", "transfer_in"

### Step 3: POST API — transfer 처리
- transfer_out + linkedAssetId → Asset.value -= amount (Prisma 트랜잭션)
- transfer_in + linkedAssetId → Asset.value += amount

### Step 4: PUT API — 자산 역산 + 재적용
- 기존 transfer 효과 역산 후 새 transfer 효과 적용

### Step 5: DELETE API — 자산 역산
- transfer_out → Asset.value += amount (복원)
- transfer_in → Asset.value -= amount (복원)

### Step 6: TransactionForm 확장
- 유형 세그먼트 (소비/수입/출금/입금)
- 출금/입금 시 자산 select + 임팩트 미리보기

### Step 7: TransactionTable 확장
- transfer 뱃지 ("출금 → 자산명" / "입금 → 자산명")

### Step 8: whooing-webhook 확장
- transfer_out: left=카테고리, right=자산명
- transfer_in: left=자산명, right=결제수단
