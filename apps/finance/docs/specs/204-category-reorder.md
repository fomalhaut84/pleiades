# 카테고리 정렬 변경 기능

## 목적

카테고리 관리 페이지에서 정렬 순서를 직관적으로 변경할 수 있도록 ↑/↓ 버튼을 추가한다.
현재는 수정 패널에서 sortOrder 숫자를 수동 입력해야 하며, 직관적이지 않다.

## 요구사항

- [ ] `POST /api/categories/reorder` 일괄 정렬 업데이트 API
- [ ] CategoryTable 데스크톱: 액션 열에 ↑/↓ 버튼 추가
- [ ] CategoryTable 모바일 카드: ↑/↓ 버튼 추가
- [ ] expense 탭: 그룹 내에서 이동 (같은 그룹 내 인접 항목 스왑)
- [ ] income 탭: 플랫 리스트에서 이동
- [ ] 첫 번째 항목 ↑ 비활성화, 마지막 항목 ↓ 비활성화
- [ ] lint + typecheck + build 통과

## 기술 설계

### 변경 파일

| 파일 | 작업 | 설명 |
|------|------|------|
| `src/app/api/categories/reorder/route.ts` | 신규 | 일괄 정렬 업데이트 API |
| `src/components/category/CategoryTable.tsx` | 수정 | ↑/↓ 버튼 추가 (데스크톱 + 모바일) |

### Reorder API

`POST /api/categories/reorder`

요청:
```json
{ "items": [{ "id": "abc", "sortOrder": 1 }, { "id": "def", "sortOrder": 2 }] }
```

- items 배열 필수, 각 항목 id(string) + sortOrder(0-999 정수)
- `prisma.$transaction`으로 원자적 업데이트
- DB 마이그레이션 불필요 (sortOrder 필드 이미 존재)

### CategoryTable UI

**handleReorder(categoryId, direction):**
- 인접 항목과 sortOrder 스왑
- reorder API 호출
- `router.refresh()`로 화면 갱신

**expense 탭:** 그룹 내에서만 이동 (같은 groupId 내 인접 항목 스왑)
**income 탭:** 플랫 리스트에서 이동

## 테스트 계획

- [ ] 카테고리 ↑ 클릭 → sortOrder 스왑, 화면 갱신, DB 반영
- [ ] 첫 항목 ↑ 비활성화, 마지막 항목 ↓ 비활성화
- [ ] expense 그룹 내 이동 정상
- [ ] income 플랫 리스트 이동 정상
- [ ] 모바일에서도 ↑/↓ 동작
- [ ] lint + typecheck + build 통과

## 제외 사항

- 드래그앤드롭 (패키지 추가 불필요, 카테고리 수 30개 미만)
- 그룹 간 이동 (그룹 변경은 수정 패널에서 처리)
