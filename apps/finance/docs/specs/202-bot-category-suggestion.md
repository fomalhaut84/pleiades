# 텔레그램 봇 카테고리 히스토리 추천 적용

## 목적

텔레그램 봇에서 소비/수입 입력 시 웹과 동일하게 히스토리 기반 카테고리 추천을 적용한다.

## 현상

- 웹 (`/api/transactions/suggest`): 키워드 매칭 + 히스토리 매칭 (과거 6개월 거래 description ILIKE) → 최대 5개 추천
- 텔레그램 (`src/bot/commands/expense.ts`): `matchCategory()`만 사용 → 키워드 매칭만 동작
- 키워드 미등록 description 입력 시 웹에서는 과거 거래 기반 추천이 되지만, 텔레그램에서는 전체 카테고리 목록 표시

## 요구사항

- [ ] 텔레그램 봇에서 키워드 미매칭 시 히스토리 기반 추천 적용
- [ ] 웹 suggest API와 동일한 로직 (최근 6개월 거래, description 유사 → categoryId별 count)
- [ ] 히스토리 추천 결과가 있으면 전체 목록 대신 추천 목록 표시
- [ ] 히스토리 추천도 없으면 기존대로 전체 카테고리 목록 표시
- [ ] lint + typecheck + build 통과

## 기술 설계

### 변경 파일

| 파일 | 작업 | 설명 |
|------|------|------|
| `src/lib/category-matcher.ts` | 수정 | `suggestByHistory()` 함수 추가 (suggest API의 히스토리 로직 추출) |
| `src/bot/commands/expense.ts` | 수정 | 키워드 미매칭 시 `suggestByHistory()` 호출 |

### 수정 내용

#### 1. category-matcher.ts — `suggestByHistory()` 추가

웹 suggest API(`src/app/api/transactions/suggest/route.ts` L55-101)의 히스토리 매칭 로직을 공유 함수로 추출한다.

```typescript
export async function suggestByHistory(
  description: string,
  type: 'expense' | 'income',
  excludeIds?: string[]
): Promise<MatchedCategory[]>
```

- 최근 6개월 거래에서 description ILIKE → categoryId별 count
- excludeIds로 이미 키워드 매칭된 카테고리 제외
- 최대 5개 반환

#### 2. expense.ts — 미매칭 시 히스토리 추천

현재 흐름 (L118-119):
```typescript
// 다중 매칭 또는 미매칭 → 카테고리 선택
const categories = matched.length > 1 ? matched : await getAllCategories(type)
```

변경 후:
```typescript
// 다중 매칭 → 그대로 표시, 미매칭 → 히스토리 추천 시도 → 없으면 전체 목록
let categories: MatchedCategory[]
if (matched.length > 1) {
  categories = matched
} else {
  const historySuggestions = await suggestByHistory(description, type)
  categories = historySuggestions.length > 0 ? historySuggestions : await getAllCategories(type)
}
```

#### 3. suggest API 리팩터링

`src/app/api/transactions/suggest/route.ts`의 히스토리 로직을 `suggestByHistory()` 호출로 교체하여 중복 제거.

## 테스트 계획

- [ ] 텔레그램에서 키워드 등록된 description 입력 → 기존대로 단일/다중 키워드 매칭
- [ ] 텔레그램에서 키워드 미등록이지만 과거 거래 있는 description → 히스토리 추천 목록 표시
- [ ] 텔레그램에서 키워드도 히스토리도 없는 description → 전체 카테고리 목록 표시
- [ ] 웹 suggest API 기존 동작 유지
- [ ] lint + typecheck + build 통과

## 제외 사항

- 추천 UI 개선 (추천 source 표시 등)은 별도 이슈
