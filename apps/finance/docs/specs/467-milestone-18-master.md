# 18차 마일스톤 — AI 어드바이저 안정성 + 모바일 UX 잔여

**상태**: 기획
**작성일**: 2026-07-21
**선행 릴리즈**: v0.15.0 (17차, 2026-07-16)

## 목적

두 축으로 구성:

1. **AI 어드바이저 안정성 (Phase 40)** — 17차 릴리즈 후 실측된 UX 문제 해소.
   Claude CLI 인증 만료 시 사용자가 "MCP 도구 접근 불가" 안내를 받아야만 발견하는 구조.
   관리자 alert + 사용자 fallback 메시지 개선으로 detect/recover 사이클 단축.

2. **모바일 UX 잔여 (Phase 41)** — 39-A audit 의 L (Low) 3건 마무리.
   17차 스코프에서 "follow-up 후보" 로 미룬 항목.

## 서브이슈

### Phase 40 — AI 어드바이저 안정성

#### 40-A (S, 1일) Claude CLI 인증 만료 감지 + 관리자 alert
**목적:** subprocess 실패를 관리자가 능동 감지. 지금은 사용자 UX 저하 후 발견.

**요구사항:**
- [ ] AdvisorError 발생 시 fail count 누적 (in-memory 또는 DB)
- [ ] **연속 3회 실패 시** 관리자 텔레그램 chat 에 alert 발송 — "AI 어드바이저 실패 지속. `claude` CLI 인증 확인 필요."
- [ ] Alert 은 recovery (다음 성공) 까지 30분 간격 반복 (스팸 방지)
- [ ] `[[reference_claude_cli_auth_expiry]]` 진단 절차 링크 alert 본문에 포함
- [ ] 세션 파일 (`~/.claude/`) mtime 기반 사전 경고 검토 (30일 초과 등) — 스코프 확정 시 결정

**참고:**
- 실 사례: 2026-07-21 세션에서 7-1부터 산발적 exit 1 발생, 관리자가 사용자 브리핑 안내로 발견
- 코드 위치: `src/lib/ai/claude-advisor.ts` (AdvisorError 발생 지점), `src/bot/notifications/` (alert 발송)

#### 40-B (S, 반나절) 봇 fallback 응답 개선
**목적:** subprocess 실패 시 사용자에게 actionable 메시지 전달.

**요구사항:**
- [ ] `AdvisorError.code` 확장 — 원인별 분기 (`auth_expired` / `quota_exceeded` / `server_down` / `unknown`)
- [ ] 봇 caller 별 (briefing / ta-signal / active-review / `/ai` 등) fallback 텍스트 갱신
- [ ] 예: "AI 어드바이저 일시 중단 — 관리자에게 문의해주세요 (원인: 인증 갱신 필요)"
- [ ] 40-A 관리자 alert 와 함께 사용자 UX 도 즉시 개선

**참고:**
- 현재는 Claude 자체가 "MCP 도구 승인 필요" 안내를 리턴 → 사용자가 승인 방법을 몰라 혼란
- fallback 은 봇 side 에서 결정 (subprocess 실패 시 Claude 응답 대신 미리 정의된 텍스트)

#### 40-C (optional, M) AI 어드바이저 심화 — 스코프 확정 후
검토 항목:
- 대화 히스토리 요약 (긴 세션 컨텍스트 압축)
- 도구 사용 최적화 (호출 순서 · 병렬화 · 재사용 방지)
- 프롬프트 캐시 활용
- **스코프 재검토 시점**: 40-A/40-B 완료 후 실측 데이터 기반 결정

### Phase 41 — 모바일 UX 잔여

#### 41-A (S, 반나절) Vesting Calendar 리스트 뷰 옵션
**증상:** `grid-cols-7` (375px 에서 셀당 ~53px) → 날짜 라벨 + 뱃지 겹칠 여지
**Fix:** mobile 은 리스트 뷰로 전환 (`sm:hidden` 카드 스택 + `hidden sm:grid` 캘린더)

- 파일: `src/components/vesting/VestingCalendar.tsx:81, 89`

#### 41-B (XS, 1~2시간) AI chat 코드블록 mobile 처리
**증상:** `max-w-[85%] sm:max-w-[75%]` — 375px 에서 코드블록·리스트가 좌우 스크롤 유발
**Fix:** 코드블록 전용 `overflow-x-auto` wrapper + word-break: break-word

- 파일: `src/app/ai/AIClient.tsx` message 렌더 부분

#### 41-C (XS, 1시간) FamilyTotalCard 반응형
**증상:** 3-col 고정 grid (셀당 ~110px) — 확인 완료 이슈 없다 판정했으나 사용자 실 요청 시 재검토
**Fix:** 필요 시 `grid-cols-3 sm:grid-cols-3` (동일) 유지 or `flex-col sm:grid-cols-3` 세로 스택 옵션

- 파일: `src/components/dashboard/FamilyTotalCard.tsx:61`

## 비-포함 (Out of scope)

- 알림 저장 정규화 (`PRE_ESCAPED_KINDS` gating 제거) → 별도 마일스톤 검토
- 뉴스 조건 (Phase 36 이월) → 외부 API 정책 확정 후
- 성능 최적화 (TA 캐시 · 시세 배치) → profiling 우선

## 완료 조건

- [ ] Phase 40 A/B 완료 (40-C 는 결정에 따라)
- [ ] Phase 41 A/B/C 완료
- [ ] 각 서브이슈: lint / typecheck / test:run / build 통과 + pr-review-toolkit + Codex bot 리뷰 P1/P2 = 0
- [ ] v0.16.0 릴리즈 태그 + GitHub Release
- [ ] 프로덕션 배포 검증

## 노력 산정

- Phase 40: S+S(+M) = 2일 (40-C 포함 시 4일)
- Phase 41: S+XS+XS = 1일
- **총 3~5일** (17차 6일보다 작음)
