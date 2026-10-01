# 17-A: 계좌 관리 — 구현 계획

## 변경 파일 목록

### 신규
- `src/app/settings/page.tsx` — 설정 페이지
- `src/app/settings/SettingsClient.tsx` — 탭 관리 클라이언트
- `src/components/settings/AccountEditor.tsx` — 계좌 카드 읽기/편집

### 수정
- `src/app/api/accounts/[id]/route.ts` — PATCH 추가
- `src/components/layout/nav-config.ts` — 설정 메뉴 추가

## 패키지 추가
없음

## DB 마이그레이션
없음

## 디자인 참조
- `docs/designs/178-account-editor/prototype.html` (승인 완료)

## 구현 순서

### Step 1: PATCH /api/accounts/[id]
- 수정 가능 필드: name, strategy, horizon, benchmarkTicker, ownerAge
- 부분 업데이트 (전달된 필드만)
- P2025 → 404

### Step 2: AccountEditor 컴포넌트
- Props: accounts[]
- 각 계좌 카드: 읽기 모드 (label:value) / 편집 모드 (인라인 폼) 전환
- 한 번에 하나만 편집 (editingId 상태)
- 저장 → PATCH API, 취소 → 읽기 모드 복원

### Step 3: /settings 페이지 + SettingsClient
- 탭 바: 계좌 | 알림 | 근로소득 | 후잉 연동
- 17-A에서는 "계좌" 탭만 구현, 나머지 placeholder
- 계좌 목록 fetch → AccountEditor 렌더링

### Step 4: nav-config
- 최하단 "설정" 그룹 추가 (⚙️ 설정)
