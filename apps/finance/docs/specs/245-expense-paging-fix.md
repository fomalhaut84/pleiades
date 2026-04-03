# 가계부 수정 시 페이징 초기화 버그 수정

## 목적

가계부 내역 수정/삭제 후 페이지가 첫 페이지로 돌아가는 문제 수정.

## 원인

handleSaved → fetchData → offset: '0' 하드코딩 + setOffset(0) 호출.
필터(연도/월/탭) 변경 시에는 offset 초기화가 맞지만,
내역 수정/삭제 시에는 현재 페이지를 유지해야 함.

## 요구사항

- [ ] 내역 수정/삭제 후 현재 페이지 유지
- [ ] 필터 변경 시에는 기존대로 offset 초기화

## 기술 설계

### 변경 파일 (1개)

**`src/app/expenses/ExpensesClient.tsx`**
- fetchData에 keepOffset 옵션 추가
- handleSaved에서 현재 offset 유지하여 조회

## 테스트 계획

- [ ] 2페이지에서 내역 수정 → 2페이지 유지
- [ ] 연도/월 변경 → 첫 페이지로 이동 (기존 동작)
- [ ] lint + typecheck + build 통과
