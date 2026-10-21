# 구현 계획: 수입 카테고리 후잉 매핑 누락 수정 (#208)

## 변경 파일 (1개)

| 순서 | 파일 | 변경 내용 |
|------|------|-----------|
| 1 | `src/components/settings/WhooingSettings.tsx` | expense 필터 제거, 소비/수입 그룹 구분 표시 |

## 구현 내용

1. L57: `.filter((c) => c.type === 'expense')` 제거 → 전체 카테고리 로드
2. 카테고리 렌더링: `expenseCategories` / `incomeCategories`로 분리 후 각 그룹에 소제목 행 추가

## 패키지 추가: 없음
## DB 마이그레이션: 없음
