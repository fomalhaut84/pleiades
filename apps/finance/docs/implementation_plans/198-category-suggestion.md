# 구현 계획: 카테고리 추천 기능 (#198)

## 변경 파일

| 파일 | 작업 | 설명 |
|------|------|------|
| `src/app/api/transactions/suggest/route.ts` | 신규 | 카테고리 추천 API (키워드 + 히스토리) |
| `src/components/expense/TransactionForm.tsx` | 수정 | description 입력 시 추천 UI 표시 |

## 구현 순서

1. suggest API 생성 (키워드 매칭 + 히스토리 매칭)
2. TransactionForm에 추천 UI 연동

## 패키지 추가

없음

## DB 마이그레이션

없음
