# 카테고리 추천 기능

## 목적

웹 가계부(TransactionForm)에서 내역 추가 시 40개+ 카테고리를 수동 선택해야 하는 불편함 개선.
내용(description) 입력 시 키워드 매칭 + 과거 거래 히스토리 기반으로 카테고리를 자동 추천한다.

## 요구사항

- [ ] 추천 API (`GET /api/transactions/suggest?q=...`) 구현
  - [ ] q 파라미터 필수, 2글자 이상
  - [ ] `matchCategory()` 키워드 매칭 재사용 (source: "keyword")
  - [ ] Transaction description ILIKE → categoryId별 GROUP BY count (source: "history")
  - [ ] 중복 제거 (keyword 우선), 최대 5개 반환
- [ ] TransactionForm 추천 칩 UI
  - [ ] description onChange → 300ms 디바운스 → suggest API 호출
  - [ ] AbortController로 이전 요청 취소
  - [ ] 카테고리 select 위에 추천 칩 렌더링
  - [ ] 칩 클릭 → setCategoryId 자동 설정
  - [ ] 추천 없으면 칩 영역 숨김
  - [ ] 수정 모드(edit)에서도 description 변경 시 동작

## 기술 설계

### 추천 API

**엔드포인트**: `GET /api/transactions/suggest?q=점심`

**응답 형태**:
```json
{
  "suggestions": [
    { "categoryId": "xxx", "categoryName": "외식", "categoryIcon": "🍽️", "source": "keyword" },
    { "categoryId": "yyy", "categoryName": "식료품", "categoryIcon": "🥬", "source": "history", "count": 15 }
  ]
}
```

**로직**:
1. `matchCategory(q, 'expense')` + `matchCategory(q, 'income')` 호출
2. Prisma `transaction.groupBy({ by: ['categoryId'], where: { description: { contains: q, mode: 'insensitive' } } })`
3. keyword 매칭 결과 우선, 히스토리에서 중복 제거, 최대 5개

### TransactionForm UI

- 상태: `suggestions` 배열
- 디바운스: 300ms setTimeout + clearTimeout
- AbortController: 이전 fetch 취소
- 칩 스타일: `bg-surface border-border rounded-full` (기존 뱃지 패턴)
- 선택된 칩: `bg-sodam/15 border-sodam/30 text-sodam`

## 변경 파일

### 신규
- `src/app/api/transactions/suggest/route.ts`

### 수정
- `src/components/expense/TransactionForm.tsx`

### 재사용 (변경 없음)
- `src/lib/category-matcher.ts`

## 테스트 계획

- "점심" 입력 → 외식/식료품 추천 칩 표시
- 칩 클릭 → 카테고리 자동 선택
- "asdf" 입력 → 추천 없음 (칩 숨김)
- 빠른 타이핑 → 디바운스로 마지막 요청만 실행
- lint + typecheck + build 통과

## 제외 사항

- DB 스키마 변경 없음
- 텔레그램 봇 측 변경 없음
- 새 패키지 추가 없음
