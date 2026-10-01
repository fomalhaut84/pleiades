---
name: codex-response-patterns
description: "myFinance 프로젝트에서 반복 발견되는 Codex bot 리뷰 P2 패턴과 즉시 대응 방법. canonical key = evaluator semantics, defense in depth, KST 정규화, JSON.stringify 대체 등. Codex 리뷰 URL 도착 시, 리뷰 대응 판단, 회귀 방지 테스트 추가 시 사용."
---

# Codex Response Patterns — 반복 P2 대응 학습

myFinance 에서 Codex bot 이 반복 발견하는 패턴 카탈로그. release-manager 가 사용.

## 학습 원칙
**canonical key = evaluator semantics** — 16차 PR #440 에서 확립. 어떤 비교 로직이든 실행 시 semantics (무시하거나 정규화되는 필드) 를 그대로 반영해야 무변경 편집이 false-positive 되지 않는다.

## 반복 P2 카탈로그

### 1. Canonical key 정규화 누락
**증상**: `conditionsEqual` / `condKey` 가 evaluator 실행 시 무시·정규화되는 필드를 유지 → 의미상 동일한 값을 다르다고 오판 → `lastTriggeredAt` 오리셋 → 알림 재무장 회귀.

**패턴**:
- weekday value 순서 유지 (evaluator 는 `includes` unordered)
- cross_ticker.crossTicker 원본 유지 (evaluator 는 `trim().toUpperCase()`)
- 비-change_pct 조건에 timeframe 포함 (evaluator 는 change_pct 만 사용)
- JSON.stringify 필드 순서 민감

**대응**: `condKey(c)` 헬퍼에 정규화 추가. 회귀 방지 테스트 필수.

### 2. Defense in depth 누락 (client-only 검증)
**증상**: 클라이언트만 검증 → 다른 클라이언트/직접 API 호출에서 우회 → 사일런트 버그.

**대응**: 서버측 재검증 추가. 클라이언트는 UX 편의, 서버는 진실 근원.

### 3. KST 경계 처리
**증상**: `Date.now()` / `new Date()` 원시 timestamp 비교 → KST 자정 넘김에서 오검출.

**대응**: `src/lib/kst-date.ts` 유틸 (`kstMidnightUtc`, `kstDayDiff`, `isSameOrFutureKstDay`) 사용.

### 4. Unique constraint 부재
**증상**: Prisma upsert 가 unique 셀렉터 요구. `@@index` 만으론 부족.

**대응**: `@@unique([field1, field2])` composite key 명시 (URL 글로벌 unique 는 위험 — 여러 티커에 걸린 뉴스 등).

### 5. AI 세션 이어가기 + model 변경
**증상**: `--resume` 세션이 옛 model 유지 → 새 model 명시해도 무시.

**대응**: 배포 후 텔레그램 `/reset` 안내 항상 (릴리즈 노트 명시).

### 6. Cron 부팅 후 dead window
**증상**: 신규 배포 후 첫 스케줄까지 초기 데이터 미확보 → 사용자 "설정했는데 왜 안 되나".

**대응**: 부팅 즉시 초기 시드 (`if (count === 0) runOnce()`). `scheduleKrxSync` / `scheduleEarningsScan` 패턴.

### 7. 대용량 파일 전체 로드
**증상**: `fs.readFileSync` 로 로그/데이터 파일 전체 로드 → 프로세스 블록.

**대응**: EOF 창만 `fs.openSync + fs.readSync` (예: `MAX_TAIL_BYTES = 8MB`).

### 8. Stale UI state
**증상**: 미리보기·폼 dirty 상태와 서버 저장 값 어긋남.

**대응**: dirty 시 preview 차단 or textarea onChange 로 preview invalidate.

### 9. lastTriggeredAt 오리셋
**증상**: 실제 변경 없는데 (필드 순서만 다름) 리셋 → `once` 재무장 / `daily` 중복.

**대응**: 서버측 deep equal (`conditionsEqual`) 로 비교, 실제 변경 시만 리셋. 클라이언트도 diff 로 사전 필터.

### 10. Alpha Vantage / 외부 API 라이선스
**증상**: 무료 tier 라이선스 (개인/비상용 등) 오해.

**대응**: 스펙 문서에 라이선스 원문 링크 + 사용 정황 명시 (예: "myFinance 는 세진 개인 가족 자산관리 → 스코프 적합").

## 대응 워크플로우
1. Codex 리뷰 URL 도착
2. `gh api repos/{owner}/{repo}/pulls/{N}/comments --jq '.[] | select(.pull_request_review_id == {ID}) | {path, line, body}'` 로 finding 확인
3. 카탈로그 매칭 → 즉시 반영 or 신규 패턴이면 근본 원칙 도출
4. 수정 커밋 + **회귀 방지 유닛 테스트 페어링 필수**
5. `@codex review` 재리뷰 요청 (P2 반영 시만)
6. 반복 3라운드 초과 시 → 근본 원칙 재검토 (이 파일 확장)

## 회귀 방지 테스트 원칙
- 파일: `src/lib/{module}/__tests__/{module}.test.ts`
- 이름: `it('conditionsEqual — {상황} (Codex #{PR} P2 회귀 방지)', ...)`
- Assertion: 오탐 케이스가 이제는 `equal` (or 정상 판정) 임을 명시
- 반대 케이스 (실제로 다를 때) 도 함께 검증 → 정규화가 과도하지 않음 증명

## 프로젝트 참고
- 16차 PR #440 리뷰 사이클: canonical key 원칙 확립
- Memory: `project_milestone16_complete.md` — 학습 원칙 요약
