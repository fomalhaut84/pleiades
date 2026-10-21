# 네비게이션 개선 — 사이드바 그루핑 + 스크롤 + 모바일 누락 수정 + 교육 뷰 진입점

## 목적

15개 Phase를 거치며 사이드바 메뉴가 15개로 늘어나 작은 화면에서 하단이 잘리는 문제 해결.
모바일 BottomTab에서 가계부/카테고리 메뉴 누락 해결.
/kids 페이지 진입점 부재 해결 (계좌 상세 페이지에서 진입).

## 요구사항

### 사이드바 (Sidebar.tsx)
- [ ] 메뉴를 3개 그룹으로 분류 (포트폴리오 / 분석 / AI & 전략)
- [ ] 각 그룹 접기/펼치기 (▾ 화살표)
- [ ] 접기 상태 localStorage 저장 + hydration-safe 로드
- [ ] 현재 활성 페이지가 속한 섹션은 자동 펼침
- [ ] nav 영역 overflow-y-auto 스크롤 지원
- [ ] NavLink / NavSection 서브 컴포넌트 추출 (반복 패턴 제거)

### 모바일 하단탭 (BottomTab.tsx)
- [ ] MORE_ITEMS에 /expenses(가계부), /categories(카테고리) 추가

### 공유 설정 (nav-config.ts)
- [ ] NavItem, NavGroup 인터페이스 정의
- [ ] 3개 그룹 네비게이션 정의 (Sidebar/BottomTab 공유)
- [ ] isPathActive, findActiveGroup 유틸 함수

### 계좌 상세 교육 뷰 진입점 (accounts/[id]/page.tsx)
- [ ] ownerAge != null인 계좌에서 태그 행 우측에 "🎒 교육 뷰 →" 링크 버튼 추가
- [ ] 클릭 시 /kids/[accountId]로 이동

## 기술 설계

### 그룹 구조
```
그룹 1 — 포트폴리오: 대시보드, 거래, RSU, 배당금, 입금/증여, 스톡옵션
그룹 2 — 분석: 세금, 가계부, 카테고리, 시뮬레이터, 수익률 분석
그룹 3 — AI & 전략: AI 분석, 순자산, 분기 리포트, 백테스팅
```

### 변경 파일
| 파일 | 변경 | 설명 |
|------|------|------|
| `src/components/layout/nav-config.ts` | 신규 | 네비게이션 그룹 정의 (공유) |
| `src/components/layout/Sidebar.tsx` | 리팩토링 | 그루핑 + 접기/펼치기 + 스크롤 |
| `src/components/layout/BottomTab.tsx` | 수정 | 누락 메뉴 추가 (가계부/카테고리) |
| `src/app/accounts/[id]/page.tsx` | 수정 | 교육 뷰 링크 버튼 추가 |

### 의존성
- layout.tsx 변경 불필요
- 추가 패키지 없음
- DB 마이그레이션 없음

## 테스트 계획

```bash
npm run lint && npx tsc --noEmit && npm run build
```

수동 검증:
1. 데스크톱 사이드바 — 섹션 접기/펼치기 + 새로고침 후 상태 유지
2. 활성 메뉴 섹션 자동 펼침
3. 모바일 더보기 — 가계부/카테고리 표시
4. 사이드바 작은 화면 — 스크롤 동작
5. 소담/다솜 계좌 상세 — 교육 뷰 링크 표시 + /kids/[id] 이동
6. 세진 계좌 상세 — 교육 뷰 링크 미표시

## 제외 사항
- 네비게이션 순서 변경 외 기능 변경 없음
- 라우팅/페이지 자체 수정 없음
- /kids 페이지 내용 변경 없음
