# Phase 31-B — AlertConfig 통합 설정 UI

- **작성일**: 2026-07-02
- **참조**: [395-milestone-13-master.md](./395-milestone-13-master.md)
- **선행 이슈**: 31-E (#392) 후에 진행 (컴포넌트 위치가 nav-config 리팩터 여파 받음)

## 1. 목적

늘어난 AlertConfig 키를 카테고리별로 그루핑해 `/settings` 페이지에서 파악/제어 편의 확보.

## 2. 현재 상태

`AlertConfig` 테이블 (`prisma/schema.prisma`):
```
model AlertConfig {
  key    String @id
  value  String
  label  String?
}
```

`/settings` 페이지는 이 row 들을 flat 하게 나열 — 카테고리 구분 없음.

**현재 등록된 키** (배포 자동 upsert 기준):
- **가격/환율 알림**: `price_drop_pct`, `price_surge_pct`, `fx_change_krw`
- **TA 관련**: `ta_check_interval_min`, `ta_ai_guide`
- **능동 AI**: `active_review`
- **커스텀 전략**: `custom_strategy_alerts`
- **일반**: `daily_summary_hour`, `whooing_url` 등

## 3. 요구사항

- [ ] AlertConfig 에 `category` 필드 추가 (스키마 + migration)
- [ ] `ensure*Setting` 함수들이 upsert 시 category 도 지정
- [ ] `/api/alerts/config` 응답에 category 포함
- [ ] `/settings` 페이지에서 카테고리별 아코디언 (기본 접힘 or 펼침 결정)
- [ ] 각 섹션에 설명 + 관련 페이지 링크 (예: "커스텀 전략" 섹션 → `/strategies` 링크)
- [ ] 기존 URL/앵커 유지 (예: `/settings#alerts`)
- [ ] 신규 키 추가 시 category 만 지정하면 자동으로 해당 섹션에 나타남

## 4. 기술 설계

### DB migration
```prisma
model AlertConfig {
  key      String  @id
  value    String
  label    String?
  category String  @default("general")  // 'price' | 'ta' | 'ai' | 'strategy' | 'general'
  order    Int     @default(0)          // 섹션 내 정렬
}
```

Migration: 기존 row 들을 초기 카테고리 매핑 (스크립트로 upsert).

### 카테고리 상수
```ts
// src/lib/alert-config/categories.ts
export const CATEGORIES = [
  { key: 'price', label: '가격 / 환율 알림', description: '급등락 임계값', pageLink: null },
  { key: 'ta', label: '기술적 분석 알림', description: 'TA 시그널 + AI 가이드', pageLink: '/strategies' },
  { key: 'ai', label: '능동 AI 리뷰', description: '클로징/주간 리뷰', pageLink: null },
  { key: 'strategy', label: '커스텀 전략', description: '자연어 조건 감시', pageLink: '/strategies' },
  { key: 'general', label: '일반', description: '기타 알림/설정', pageLink: null },
]
```

### `/settings` UI 구조
- 상단: 페이지 제목 + 총 활성 키 요약
- 카테고리 섹션 반복:
  - 섹션 헤더 (label + 관련 페이지 링크)
  - 소속 키 리스트 (label + value 편집 + Save 버튼)
- 접힘/펼침: 로컬 저장 (localStorage) 로 상태 유지

### API 변경
- `GET /api/alerts/config` → 응답에 category 필드 추가 (envelope 유지)
- `PUT /api/alerts/config` → 기존과 동일 (key + value 만 업데이트)
- `POST /api/alerts/config/reseed` (선택) — 카테고리 매핑 다시 채우기 (운영자용)

## 5. 디자인 단계

`frontend-design` 스킬로 프로토타입:
- 카테고리 섹션 아코디언 레이아웃
- 각 키의 편집 UI (숫자 slider / toggle / dropdown / text)
- 관련 페이지 링크 배지
- 다크 테마 + 반응형

승인 후 `docs/designs/396-alert-config-ui/` 저장.

## 6. 테스트 계획

- [ ] 유닛: 카테고리별 그루핑 로직
- [ ] 유닛: 기존 값 유지 + 신규 category 필드 upsert
- [ ] API: envelope + category 필드 포함
- [ ] 통합: 각 ensure*Setting 이 정확한 category 로 upsert
- [ ] lint / typecheck / test / build

## 7. 제외

- 알림 로그/히스토리 페이지 (별도 이슈)
- 카테고리 관리 UI (사용자가 카테고리 추가/삭제) — v2 후보

## 8. 완료 시

`/settings` 페이지가 카테고리별로 정리되어 신규 키 추가 시 코드 한 곳만 갱신하면 UI 자동 반영.
