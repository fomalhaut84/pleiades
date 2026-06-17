# [Phase 26-D] Generic 성공 토스트 확장

## 목적

25-G-3 에서 도입한 Toast 인프라를 거래/배당/자산/카테고리 등 다른 mutation 컴포넌트에도 확장 적용. 사용자가 생성/수정/삭제 성공을 명확하게 인지하도록 한다.

## 배경

- Toast 인프라 (`<ToastProvider>` + `useToast()`) 이미 존재 (25-G-3)
- 현재 적용 컴포넌트: TradeForm + TradeEditPanel (holding diff 토스트)
- 나머지 22개 mutation 컴포넌트는 `router.refresh` + 모달 닫기만 — 사용자 피드백 없음
- DELETE 응답 형식 (25-E 204) 은 그대로 유지 — 클라이언트는 `res.ok` 만 확인 후 토스트 표시

## 요구사항

- [ ] **9 DeleteModal** 에 성공 토스트 추가:
  - DividendDeleteModal — "배당이 삭제되었습니다"
  - DepositDeleteModal — "입금이 삭제되었습니다"
  - AssetDeleteModal — "자산이 삭제되었습니다"
  - CategoryDeleteModal — "카테고리가 삭제되었습니다"
  - TransactionDeleteModal — "내역이 삭제되었습니다"
  - RecurringDeleteModal — "반복 거래가 삭제되었습니다"
  - DeleteModal (Trade) — "거래가 삭제되었습니다"
  - RSUDeleteModal — "RSU가 삭제되었습니다"
  - StockOptionDeleteModal — "스톡옵션이 삭제되었습니다"
- [ ] **13 Form/EditPanel** 에 성공 토스트 추가:
  - DividendForm (POST) — "배당이 등록되었습니다"
  - DividendEditPanel (PUT) — "배당이 수정되었습니다"
  - DepositForm (POST) — "입금이 등록되었습니다"
  - DepositEditPanel (PUT) — "입금이 수정되었습니다"
  - AssetForm (POST/PUT) — 모드별 분기
  - CategoryForm (POST) — "카테고리가 추가되었습니다"
  - CategoryEditPanel (PUT) — "카테고리가 수정되었습니다"
  - RSUForm (POST/PUT) — 모드별 분기
  - StockOptionForm (POST/PUT) — 모드별 분기
  - IncomeProfileForm (POST/PUT) — "소득정보가 저장되었습니다"
  - TransactionForm (POST/PUT) — 모드별 분기
  - RecurringForm (POST/PUT) — "반복거래가 저장되었습니다"
  - WatchlistForm (POST/PUT) — 모드별 분기

총 **22 컴포넌트**.

## 제외

- **TradeForm / TradeEditPanel** — 이미 holding diff 토스트 적용 (25-G-3). 중복 노이즈 회피.
- **Category Reorder** (CategoryTable.tsx) — 드래그-드롭 자동 저장, 빈번
- **BudgetManager 인라인 편집** — 값 변경마다 자동 저장, 빈번
- **실패 토스트** — 기존 `setError` 박스 유지 (폼 컨텍스트 가까이 표시가 더 적합)
- **자연어 거래 입력** (텔레그램, AI) — UI 외부

## 기술 설계

### 1. 적용 패턴

모든 컴포넌트가 동일 패턴:

```tsx
'use client'
import { useToast } from '@/components/ui/Toast'

const { show } = useToast()

// handleSubmit / handleDelete 내부
if (res.ok) {
  show({ variant: 'success', title: '배당이 삭제되었습니다' })
  onClose() // or router.push / router.refresh
}
```

### 2. 모드별 메시지 (Form 이 생성/수정 겸용)

```tsx
const isEdit = !!props.entity?.id
show({
  variant: 'success',
  title: isEdit ? '자산이 수정되었습니다' : '자산이 등록되었습니다',
})
```

### 3. 에러 처리 변경 없음

기존 `setError(...)` 박스 유지. 토스트는 성공 케이스만.

### 4. 영향 검증

- 폼별로 `useToast` import 추가
- 성공 분기 (res.ok 후) 에 `show(...)` 1줄 추가
- 페이지 전환 시 토스트는 layout 레벨이라 유지됨 (25-G-3 검증 완료)

## 테스트 계획

- `npm run lint && npx tsc --noEmit && npm run test:run && npm run build`
- 단위 테스트는 추가하지 않음 — 패턴이 단순하고 UI 검증 위주
- 수동 회귀:
  - 9 DeleteModal 모두 삭제 후 토스트 표시 확인
  - 13 Form/EditPanel 모두 생성/수정 후 토스트 표시 확인
  - 4초 후 자동 닫힘 + 호버 정지 (Toast 인프라 동작)
  - 페이지 전환 후에도 토스트 표시 유지

## 제외 사항 (재정리)

- 실패 토스트 — `setError` 박스 유지
- 토스트 메시지 i18n — 한국어 고정
- 자동 저장 컴포넌트 (Category reorder, BudgetManager) — 노이즈 우려
- TradeForm/EditPanel — holding diff 토스트로 충분
