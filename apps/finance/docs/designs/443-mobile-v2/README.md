# Phase 39-C: 모바일 v2 신규 페이지 재감사

**대상**: 17차 마일스톤 (#443) 서브이슈 #452
**작성일**: 2026-07-15
**대상 페이지**: `/alerts/history` (33-B 도입), `/admin/mcp-logs` (33-C · 37-C · 37-D 도입)
**뷰포트**: iPhone SE 375 · iPhone Pro Max 430 · iPad 768

## 감사 결과 및 실행 결정

39-A audit 매트릭스의 M4 (mcp-logs 필터 밀도) 만 실질 조치 필요. 나머지 spec 결정 항목은 기존 구현으로 충분.

### ✅ M4 fix — mcp-logs `Msg` 필터 collapsible

**증상:** `KNOWN_MSGS` 15+ chips 가 mobile 에서 4~5줄로 wrap → filter section 이 세로로 매우 길어져 실제 로그 리스트 접근성 저하.

**Fix:** mobile 은 `<details>` 로 접힘 (활성 선택은 summary 라벨에 반영), 데스크톱 (`sm:`) 은 그대로 항상 표시. 두 트리 patternoal 을 CSS 로 분기.

- 파일: `src/app/admin/mcp-logs/McpLogsClient.tsx`
- Level 필터 (6개) 는 한 줄 여유 있어 접지 않음.

### 결정: 상세 모달 (`AlertHistoryDetailModal`) — **풀스크린/bottom sheet 변경 없음**

**현재 구조 (line 51):**
```
<div className="fixed inset-0 z-50 flex items-center justify-center px-4 ...">
  <div className="w-full max-w-lg ... max-h-[90vh] overflow-y-auto">
```

- overlay `px-4` → 375 viewport 에서 `w-full` = 343px content area (39-A audit 검증 완료)
- `max-h-[90vh]` + `overflow-y-auto` → 세로 스크롤로 긴 컨텐츠 처리
- 이미 mobile 안전. 풀스크린/bottom sheet 로 바꾸면 오히려 이질감 (앱 전체 컨벤션이 center-align modal 12+ 개 모두 동일 패턴).

### 결정: 툴바 (CSV / 재발송 / 다운로드) — **상단 sticky/FAB 변경 없음**

**현재 위치:**
- `AlertHistoryClient` filter bar 안 (`ml-auto` 그룹): 티커 검색 · 적용 · 초기화 · CSV 다운로드
- `McpLogsClient` filter bar 안: 파일 dropdown · 일반/크래시 · 다운로드 링크 · traceId/tool 입력

- Filter bar 자체가 페이지 상단에 있어 접근성 문제 없음
- FAB (Floating Action Button) 은 앱 컨벤션에 없음 (BottomTab 이 이미 하단 fixed → FAB 와 충돌)
- Sticky top 도 헤더 + Filter bar 중복 → 스크롤 시 상단 여백 낭비

### 결정: 실시간 tail 상태 표시 — **모바일 최적화 불필요**

**현재 구조 (LiveTailPanel.tsx:157-165):**
- `flex flex-wrap items-center gap-2` — 반응형 자동 wrap
- 상태 라벨 `● 연결됨` / `● 연결 중…` / `● 연결 오류` 컬러 코드
- 지우기 · 시작/중지 버튼 오른쪽 그룹 (`ml-auto`)

- 375 viewport 에서 헤더 2-3줄로 wrap 하지만 컨텐츠 안 잘림
- pause 버튼 위치: 이미 `시작/중지` 토글이 상태 라벨 오른쪽에 있어 시각적으로 명확

## 회귀 방지

- Msg collapse 는 CSS 클래스 조합 (`sm:hidden` / `hidden sm:flex`) 만이라 로직 회귀 없음
- 활성 msg 는 summary 라벨에 반영 → 사용자가 접힌 상태에서도 현재 필터 인지 가능
- desktop 은 기존과 완전 동일 (behavior 변경 없음)

## Screenshots

39-A 와 동일한 정적 감사 방식 적용. 실 device 캡처는 사용자 spot-check 예정.
