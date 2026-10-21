# 구현 계획: 웹 자산 관리 페이지 (#247)

## 변경 파일 (6개)

| 순서 | 파일 | 변경 내용 |
|------|------|-----------|
| 1 | `src/components/asset/AssetTable.tsx` (신규) | 자산 테이블 + 소유자 탭 |
| 2 | `src/components/asset/AssetForm.tsx` (신규) | 추가/수정 슬라이드 폼 |
| 3 | `src/components/asset/AssetDeleteModal.tsx` (신규) | 삭제 확인 모달 |
| 4 | `src/app/assets/AssetsClient.tsx` (신규) | 클라이언트 컴포넌트 (상태 관리) |
| 5 | `src/app/assets/page.tsx` (신규) | SSR 페이지 |
| 6 | `src/components/layout/nav-config.ts` | 네비게이션 링크 추가 |

## 디자인 참조
- 카테고리 관리 페이지 (`/categories`) 패턴: 테이블 + 소유자 탭 + 슬라이드 폼 + 삭제 모달

## 패키지 추가: 없음
## DB 마이그레이션: 없음
