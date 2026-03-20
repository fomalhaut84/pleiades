# 네비게이션 개선 — 구현 계획 (사후 기록)

## 이슈
- #170: 네비게이션 개선 — 사이드바 그루핑 + 스크롤 + 모바일 누락 수정

## 주요 변경 파일
```
수정:
  src/components/layout/nav-config.ts — 3개 그룹 (포트폴리오, 분석, AI&전략)
  src/components/layout/Sidebar.tsx — 섹션 접기/펼치기, 스크롤, localStorage
  src/components/layout/BottomTab.tsx — 모바일 더보기 (가계부/카테고리 추가)
  src/app/accounts/[id]/ — 교육 뷰 진입점 (🎒)
```

## 구현 순서
1. nav-config에 그룹 구조 정의
2. Sidebar 접기/펼치기 (localStorage 저장, 활성 섹션 자동 펼침)
3. 모바일 더보기 메뉴에 가계부/카테고리 추가
4. 계좌 상세 페이지에 교육 뷰 진입점 추가
