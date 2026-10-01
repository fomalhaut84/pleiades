# [Phase 28-E] ai/ask + backtest envelope 마이그 (10차 마일스톤 종료)

## 목적

10차 마일스톤 (Phase 28) **마지막 sub-PR** — AI/백테스트 도메인 2 라우트 envelope 통일.

본 PR 종료 시 27/28 시리즈 전체 envelope 마이그 완료.

## 라우트 분석

- `/api/ai/ask` POST: 단일 JSON 응답 (스트리밍 아님) — envelope 적용 가능
- `/api/backtest` POST: 단일 JSON 응답 — envelope 적용 가능. 단 catch 블록이 `error.message` 를 그대로 노출 — `.claude/rules/api-routes.md` 위반. 동시 수정.

## 요구사항

- [ ] `ai/ask/route.ts` POST → `ok({ response, model, durationMs, costUsd })` / `fail(...)`
  - AdvisorTimeoutError → `fail(504)`
  - AdvisorError + safe → `fail(error.message, 400)`
  - 일반 → `fail('AI 응답 처리에 실패했습니다.', 500)`
- [ ] `backtest/route.ts` POST → `ok({ ...result, currency })` / `fail(...)`
  - catch 블록의 `error.message` 누출 제거 — 정적 한국어 메시지
- [ ] 클라이언트 unwrap
  - `AIClient.tsx`: `data.response` → `data?.data?.response`
  - `BacktestClient.tsx`: `setResult(data)` → `setResult(data?.data)`

## 기술 설계

### 라우트 변환

| 파일 | 변환 |
|---|---|
| `ai/ask/route.ts` POST | 성공 `ok({...})`, 검증/타임아웃/일반 → `fail(msg, status)` |
| `backtest/route.ts` POST | 성공 `ok({...result, currency})`, 검증/일반 → `fail(msg, status)` (정적 메시지 통일) |

### 클라이언트

- `AIClient.tsx:83-89` — `data.response` → `data?.data?.response` + null guard
- `BacktestClient.tsx:87-89` — `setResult(data?.data ?? null)` + null guard

## 테스트 계획

- `npm run lint && npx tsc --noEmit && npm run test:run && npm run build`
- 수동 회귀: `/ai` AI 질문, `/backtest` 백테스트 실행

## 제외 사항

- 10차 마일스톤 완료 — 추후 11차 기획 별도

## 10차 마일스톤 종료

5 sub-PR (28-A~E) 완료 시 27+28 시리즈 envelope 마이그 **100%**.
- 28-A: accounts (#342)
- 28-B: networth/reports/tax-gift (#344)
- 28-C: performance/* (#346)
- 28-D: prices/* (#348)
- 본 PR (28-E): ai/ask + backtest
