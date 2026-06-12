# 구현 계획: 텔레그램 봇 카테고리 히스토리 추천 적용 (#202)

## 변경 파일

| 파일 | 작업 | 설명 |
|------|------|------|
| `src/lib/category-matcher.ts` | 수정 | `suggestByHistory()` 공유 함수 추가 |
| `src/app/api/transactions/suggest/route.ts` | 수정 | 히스토리 로직을 `suggestByHistory()` 호출로 리팩터링 |
| `src/bot/commands/expense.ts` | 수정 | 키워드 미매칭 시 `suggestByHistory()` 호출 |

## 구현 순서

1. `category-matcher.ts`에 `suggestByHistory()` 추출 (입력 길이 검증 포함)
2. suggest API를 `suggestByHistory()` 호출로 교체 (중복 제거, count 복원, 전역 정렬)
3. `expense.ts`에서 미매칭 시 히스토리 추천 호출 + source별 프롬프트 구분

## 패키지 추가

없음

## DB 마이그레이션

없음
