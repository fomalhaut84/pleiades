# 웹 자산 관리 페이지

## 목적

비주식 자산(주택청약, 입출금계좌, 적금, 보험 등)을 웹에서 추가/수정/삭제.
현재 API(GET/POST/PUT/DELETE)는 존재하지만 웹 UI가 없어 텔레그램으로만 관리 가능.

## 요구사항

- [ ] `/assets` 페이지 신규 생성
- [ ] 자산 목록 테이블 (이름, 카테고리, 소유자, 평가액, 이율, 만기일)
- [ ] 자산 추가/수정 슬라이드 폼
- [ ] 자산 삭제 모달
- [ ] 소유자별(세진/소담/다솜/공동) 탭 필터
- [ ] 네비게이션에 자산 관리 링크 추가

## 기술 설계

### 신규 파일

1. `src/app/assets/page.tsx` — SSR 자산 목록 조회
2. `src/app/assets/AssetsClient.tsx` — 클라이언트 컴포넌트
3. `src/components/asset/AssetTable.tsx` — 자산 테이블
4. `src/components/asset/AssetForm.tsx` — 추가/수정 폼
5. `src/components/asset/AssetDeleteModal.tsx` — 삭제 모달

### 수정 파일

6. `src/components/layout/nav-config.ts` — 네비게이션에 자산 관리 추가

### 카테고리 옵션

savings(적금/예금), cash(입출금), insurance(보험), real_estate(부동산),
pension(연금), loan(대출/부채), other(기타)

## 테스트 계획

- [ ] 자산 추가 → 목록에 표시
- [ ] 자산 수정 → 값 반영
- [ ] 자산 삭제 → 목록에서 제거
- [ ] 소유자별 탭 필터 동작
- [ ] lint + typecheck + build 통과

## 제외 사항

- 증여 추적 (21-B)
- 자산 간 이체 (21-B)
