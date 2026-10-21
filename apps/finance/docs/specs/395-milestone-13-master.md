# 13차 마일스톤 — 설정 UX 통합 + 전략 조건 확장 (마스터)

- **작성일**: 2026-07-02
- **타입**: 마일스톤 (마스터 스펙, sub-phase 로 분할 진행)
- **참조**: 12차 마스터 #385, `memory/project_next_milestone_13.md`, 이슈 #392 (기존 리팩터 예약)

## 1. 배경

12차까지 커스텀 전략 + 능동 AI 인프라가 안착. 실사용 관점의 다음 병목:

1. **알림 설정이 flat 나열** — active_review / custom_strategy_alerts / ta_ai_guide 등 카테고리 없이 나열. 사용자가 무슨 기능이 어떤 스위치인지 파악 어려움.
2. **모바일 nav drift 재발 우려** — 오늘 fix (#391) 는 다시 하드코딩 갱신. 근본 리팩터 필요 (#392).
3. **커스텀 전략 조건 제약** — 6개 타입만 지원, 시간 필터 없음, 보유 상태 무관.

3축 병렬 진행하여 사용자 편의성 완성 + 유지보수 부담 격리.

## 2. 목표

12차 종료 시:
- ✅ nav-config 이 사이드바 + 모바일 더보기의 단일 소스 (drift 방지)
- ✅ `/settings` 페이지가 카테고리별로 알림/설정 그루핑 → 신규 키 추가 시 코드 한 곳만 수정
- ✅ 커스텀 전략 조건에 시간 필터 (`time_window` / `weekday`) + 보유 필터 (`holding_status`) 추가

## 3. Sub-Phase 분할

### Phase 31-E: nav-config 자동 파생 리팩터 (기존 #392 재활용)

**목적**: `BottomTab.MORE_ITEMS` 하드코딩 제거 → `nav-config.ts` 단일 소스.

- [ ] `NavItem` 에 `hiddenOnMobile?: boolean` 추가
- [ ] `BottomTab.tsx` 에서 `NAV_GROUPS` 를 flat 하여 파생 (FIXED_MOBILE_HREFS 제외)
- [ ] 순서는 사이드바와 자동 일치
- [ ] 유닛 테스트: nav-config 변경 → BottomTab 반영

**노력**: S (1-2일)
**완료 조건**: 신규 페이지 추가 시 nav-config 만 갱신하면 모바일 자동 반영

### Phase 31-B: AlertConfig 통합 설정 UI

**목적**: 늘어난 알림/설정 키를 카테고리별로 그루핑해 사용자 파악/제어 편의 확보.

**현재 키 (예)**:
- 주가 관련: `price_drop_pct`, `price_surge_pct`, `fx_change_krw`
- TA 관련: `ta_check_interval_min`, `ta_ai_guide`
- 능동 AI: `active_review`
- 커스텀 전략: `custom_strategy_alerts`
- 일반: `daily_summary_hour` 등

**설계**:
- AlertConfig 키에 카테고리 정보 첨부 (metadata table 또는 코드 상수 매핑)
- `/settings` 페이지를 아코디언/섹션으로 재구성
- 각 섹션: 카테고리명 + 설명 + 관련 키 목록 + 관련 페이지 링크

**API/DB**:
- 스키마 변경 최소화 — `AlertConfig` 에 `category` 컬럼 신설 (기존 row 는 마이그레이션 스크립트로 채움)
- 또는 서버 코드 상수 매핑 유지 (스키마 변경 없이)

**노력**: 중 (API 1-2개, 컴포넌트 재구성, 디자인 단계 필요)

### Phase 31-A: 커스텀 전략 조건 확장 v2

**목적**: 파워 유저 요구 대비 + 잘못된 시간대 발동 방지.

**신규 조건 타입**:
- `time_window` — HH:MM~HH:MM 필터 (KST 기준). 예: "09:00~09:30" (KR 개장 30분)
- `weekday` — 요일 집합 (예: `[MON, TUE, WED, THU, FRI]` — 주말 제외)
- `holding_status` — `HELD` / `NOT_HELD` (해당 티커 보유 여부)

**Evaluator 확장**:
- `time_window`: 현재 KST 시각 vs 범위 (자정 경계 처리)
- `weekday`: 현재 KST 요일 vs 집합
- `holding_status`: Holdings DB 조회 후 매칭

**Parser 확장**:
- 자연어 예: "SOXL 40달러 이하 시 알림, 단 월-금 09:30-16:00 미국장 시간 내에만"
- LLM 프롬프트에 신규 타입 추가

**호환성**:
- 기존 저장된 조건은 그대로 유효 (신규 타입 addition)
- 웹/봇 표시는 새 조건 타입도 `conditionToString` 확장

**노력**: 중 (types.ts + parser + evaluator + 테스트)

## 4. 진행 순서

1. **31-E** 먼저 — 리팩터 격리, 리스크 낮음
2. **31-B** — 설정 UI 재구성, 디자인 단계 포함
3. **31-A** — 조건 확장, 테스트 부담 큼

## 5. 성공 지표

- 신규 페이지 등록 시 nav-config 한 곳만 수정으로 모바일까지 반영
- 사용자가 알림 카테고리별로 on/off 파악 가능 (스크린샷)
- 커스텀 전략에 시간/요일/보유 조건 등록 가능 → 원하지 않는 시간대 알림 억제

## 6. 제외 사항

- 커스텀 전략 v3 (뉴스/어닝/크로스-티커) — 별도 마일스톤
- 알림 로그/히스토리 페이지 — 별도 이슈
- 자동 매매 — 마일스톤 후보 아님 (책임 이슈)

## 7. 위험

- **31-B**: 설정 페이지 리팩터 시 기존 URL/앵커 깨질 수 있음. 앵커 유지 검토.
- **31-A**: LLM 파싱 프롬프트가 복잡해질수록 파싱 실패율 상승 가능. 예시 다수 포함 + fallback 안내.
- **31-E**: 파생 로직 버그 시 전체 nav 사라짐. 유닛 테스트 필수 + 배포 후 즉시 확인.

## 8. 참고

- `.claude/rules/api-routes.md` — envelope 규칙
- `src/lib/custom-strategy/` — types / parser / evaluator (11-12차 산출물)
- `docs/specs/392-mobile-nav-refactor.md` — 31-E 상세 스펙 (기존)
