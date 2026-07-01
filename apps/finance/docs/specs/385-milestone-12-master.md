# 12차 마일스톤 — 커스텀 전략 UI + AI 매매 가이드 통합 (마스터)

- **작성일**: 2026-07-01
- **타입**: 마일스톤 (마스터 스펙, 후속 sub-phase 로 분할 진행)
- **참조**: 11차 마스터 #370, 이슈 #230 (기능개선), `memory/project_next_milestone_12.md`

## 1. 배경

11차 마일스톤 (Phase 29-A/B/D/E) 로 능동 AI + 커스텀 전략 프레임워크가 백엔드/봇 계층에 안착. 그러나 두 축의 잔여 작업이 있음:

1. **AI 매매 가이드 실시간 첨부 (29-C 미완)** — 11차 마스터 #370 에서 남긴 sub-phase. TA 시그널 알림 발송 시 종목별 짧은 AI 조언이 빠져 있음. 사용자가 "왜 이 시그널이 발생했고 어떻게 대응할지" 매번 별도 질문해야 함.
2. **커스텀 전략 관리는 봇 커맨드에만 존재** — `/커스텀전략등록`, `/커스텀전략목록`, `/커스텀전략삭제` 만 있어서 조건 재검토·수정·발동 이력 확인이 불편. 사용자가 웹에서 시각적으로 관리하고 싶어 함.

두 축 모두 사용자 실사용 편의성 개선 목적. 12차는 이 두 가지를 마무리해 11차 클로징 + 사용자 관리 툴 완성.

## 2. 목표

12차 마일스톤 종료 시:
- ✅ TA 시그널 알림에 AI 짧은 조언이 첨부되어 사용자가 대응 판단을 즉시 가능
- ✅ 웹 `/strategies` 에서 커스텀 전략 조회 / 등록 / 수정 / 삭제
- ✅ 11차 마스터 이슈 #370 종료 가능

## 3. Sub-Phase 분할

### Phase 30-A: AI 매매 가이드 실시간 첨부 (11차 29-C 클로징)

**목적**: 이슈 #230 (4) 해결. TA 시그널 알림에 stock-trading-method 스킬 기반 AI 조언 첨부.

- [ ] `ta-signal-alert.ts` 발송 파이프라인에 `askAdvisor` 훅 추가
- [ ] 프롬프트: 종목 정보 + TA 데이터 + 사용자 보유 여부/전략 → 3~5줄 조언
- [ ] 티커별 쿨다운 (최소 6시간) — 같은 종목 시그널 반복 시 중복 AI 호출 억제
- [ ] `AlertConfig.ta_ai_guide = 'on'/'off'` 신규 (기본 on)
- [ ] AI 실패/타임아웃 시 fallback: TA 시그널 단독 발송 (기존 흐름)
- [ ] 예산: `maxBudgetUsd 0.05` 정도 (짧은 조언)

**노력**: S (1-2일)

### Phase 30-B: 커스텀 전략 웹 UI (`/strategies`)

**목적**: 이슈 #230 (5) 후속. 봇 커맨드 없이 웹에서 CRUD.

**API 라우트 (envelope 준수)**:
- `GET /api/custom-strategies` — 목록 (활성/비활성 포함)
- `POST /api/custom-strategies` — 등록 (자연어 → 서버 parseStrategyText → 저장)
- `PUT /api/custom-strategies/[id]` — 부분 수정 (name / isActive / frequency / logic)
- `DELETE /api/custom-strategies/[id]` — 삭제

**페이지 `/strategies`**:
- 카드 그리드: 이름, ticker, 조건 요약, 빈도, 활성 상태, 최근 발동일
- 등록 폼: 자연어 텍스트박스 → "미리보기" 버튼 → 파싱 결과 표시 → "등록" 확정
- 수정 모달: name / isActive / frequency / logic (조건 자체는 삭제 후 재등록)
- 삭제 확인 모달 (`DeleteModal` 컴포넌트 재활용)

**디자인 단계 필수**: `frontend-design` 스킬로 프로토타입 시안 → 사용자 승인 → 개발.

**노력**: M (2-3일, 디자인 포함)

## 4. 진행 순서

1. **30-A** — 짧고 결정적. 11차 마스터 종료 조건.
2. **30-B 디자인** — `frontend-design` 시안 → 사용자 승인
3. **30-B 개발** — API 라우트 → 페이지 → 폼 → 테스트

## 5. 성공 지표

- TA 시그널 알림 100건 중 AI 조언 첨부율 > 80% (실패/쿨다운 20% 이내)
- 웹 `/strategies` 페이지에서 등록 → 발동 → 수정 → 삭제 전 흐름 e2e 확인
- 웹 등록한 전략이 봇 `/커스텀전략목록` 에서도 동일하게 조회됨 (데이터 일관성)

## 6. 제외 사항

- 커스텀 전략 v2 (뉴스/시간 조건, 계좌 필터, 액션 확장) — 별도 마일스톤 후보
- AlertConfig 통합 설정 UI 리팩터 — 별도 (현재 키 수 관리 가능)
- 백테스트 UI 개선 — 별도 대규모 이슈
- 자동 매매 (실제 거래소 API) — 마일스톤 후보 아님 (책임 이슈)

## 7. 위험

- **30-A**: 시장 변동성 급증 시 TA 시그널 폭증 → AI 호출 폭증. 쿨다운 + 예산 로그 필수.
- **30-B**: 자연어 파싱 응답 지연 (askAdvisor 최대 60초) → 로딩 UI + 취소 옵션. 서버 tolerance 확인.
- 웹 등록/편집 시에도 봇과 동일 검증 파이프라인 통과 (validateParsedStrategy) — 스키마 drift 방지.

## 8. 참고

- `src/lib/custom-strategy/` — types / parser / evaluator (11차 산출물)
- `src/bot/notifications/ta-signal-alert.ts` — 30-A 통합 대상
- `src/bot/notifications/active-review.ts` — askAdvisor 사용 참고 패턴
- `docs/specs/380-custom-strategy.md` — 커스텀 전략 v1 스펙
