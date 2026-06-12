# 구현 계획: 이체(transfer) 카테고리 타입 추가 (#210)

## 변경 파일 (7개)

| 순서 | 파일 | 변경 내용 |
|------|------|-----------|
| 1 | `src/lib/category-utils.ts` | CATEGORY_TYPES에 'transfer' 추가, 라벨 '이체', 에러 메시지 수정 |
| 2 | `prisma/seed.ts` | transfer 카테고리 시드 추가 (적금, 예금, 투자계좌, 기타이체) |
| 3 | `src/components/expense/TransactionForm.tsx` | transferCategories 필터 추가, isTransfer 시 transfer 카테고리 표시 |
| 4 | `src/components/category/CategoryClient.tsx` | 탭 타입에 'transfer' 추가 |
| 5 | `src/components/category/CategoryTable.tsx` | 탭 타입에 'transfer' 추가, 탭 배열에 이체 탭 추가 |
| 6 | `src/components/category/CategoryEditPanel.tsx` | type 변경 시 transfer→groupId null (income과 동일) |
| 7 | `src/components/settings/WhooingSettings.tsx` | transfer 그룹은 이미 ['expense','income'] 순회에 포함 안 됨 → 배열에 'transfer' 추가 |

## 변경 불필요 (확인 완료)
- `src/app/api/categories/route.ts` — CATEGORY_TYPES import해서 검증 → 자동 반영
- `src/app/api/categories/[id]/route.ts` — CATEGORY_TYPES import해서 검증 → 자동 반영
- `src/components/expense/RecurringForm.tsx` — expense/income optgroup만 표시, transfer 반복거래는 불필요
- 차트/분석/예산/봇 — expense/income만 집계하므로 영향 없음

## 패키지 추가: 없음
## DB 마이그레이션: 없음 (Category.type은 String)
