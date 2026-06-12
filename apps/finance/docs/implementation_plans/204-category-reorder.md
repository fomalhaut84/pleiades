# 구현 계획: 카테고리 정렬 변경 기능 (#204)

## 변경 파일

| 파일 | 작업 | 설명 |
|------|------|------|
| `src/app/api/categories/reorder/route.ts` | 신규 | 일괄 정렬 업데이트 API |
| `src/components/category/CategoryTable.tsx` | 수정 | ↑/↓ 버튼 + handleReorder 로직 |

## 구현 순서

1. `src/app/api/categories/reorder/route.ts` 신규 생성
2. `CategoryTable.tsx`에 handleReorder 함수 추가
3. `CategoryRowDesktop`에 ↑/↓ 버튼 추가 (props로 콜백 + isFirst/isLast 전달)
4. 모바일 카드에 ↑/↓ 버튼 추가
5. expense 그룹 내 이동 + income 플랫 이동 분기

## 패키지 추가

없음

## DB 마이그레이션

없음 (sortOrder 필드 이미 존재)
