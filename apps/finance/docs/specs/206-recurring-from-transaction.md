# 거래 내역에서 반복거래 등록

## 목적

가계부 내역 리스트에서 특정 거래를 반복거래로 바로 등록할 수 있는 기능.
현재는 반복거래 페이지(`/recurring`)에서 처음부터 수동 입력해야 하지만,
기존 거래의 금액·내용·카테고리를 프리필하여 편의성을 높인다.

## 요구사항

- [ ] 거래 내역 테이블 액션 열에 "반복 등록" 버튼 추가
- [ ] transfer 유형(`transfer_in`, `transfer_out`) 거래에는 버튼 미표시
- [ ] 버튼 클릭 시 RecurringForm이 열리며 금액·내용·카테고리 프리필
- [ ] 주기·실행일·시작일은 프리필하지 않음 (거래에 없는 정보)
- [ ] 다른 폼(추가/수정)과 동시 열림 방지
- [ ] 저장 시 기존 `POST /api/recurring` API 그대로 사용
- [ ] 반복거래 페이지 기존 생성/수정 기능 회귀 없음

## 기술 설계

### 변경 파일 (3개, 프론트엔드만)

1. **`src/components/expense/RecurringForm.tsx`**
   - `RecurringPrefill` 인터페이스 export (`{ amount, description, categoryId }`)
   - `prefill?` prop 추가
   - 초기값 우선순위: `item`(edit) → `prefill`(프리필) → 빈값

2. **`src/components/expense/TransactionTable.tsx`**
   - `onRegisterRecurring?` 콜백 prop 추가
   - 삭제 버튼 뒤에 "반복 등록" 버튼 (순환 화살표 아이콘, sodam 컬러)
   - transfer 유형 제외 조건

3. **`src/app/expenses/ExpensesClient.tsx`**
   - `recurringPrefill` 상태 + 핸들러
   - 동시 폼 열림 방지 (설정 시 `editingTx`/`showForm` 초기화)
   - RecurringForm 조건부 렌더

### API 변경: 없음

기존 `POST /api/recurring` 그대로 사용.

## 테스트 계획

- [ ] 거래 내역에서 "반복 등록" 클릭 → RecurringForm 열림, 금액·내용·카테고리 프리필 확인
- [ ] 주기·실행일 선택 후 저장 → `/recurring` 페이지에서 생성 확인
- [ ] transfer 유형 거래에는 반복 등록 버튼 미표시
- [ ] 반복거래 페이지 기존 생성/수정 정상 동작 (회귀)
- [ ] lint + typecheck + build 통과

## 제외 사항

- 반복거래 자동 실행 로직 변경 없음
- API 엔드포인트 추가/변경 없음
- 반복거래 페이지 UI 변경 없음
