# Phase 24-B: 예산 + 반복거래 + 알림 설정 MCP 도구

## 목적

AI가 예산, 반복 거래, 알림 설정을 직접 관리.

## 요구사항

### 예산
- [ ] `list_budgets`: 연/월별 예산 목록
- [ ] `set_budget`: 카테고리별 월 예산 upsert
- [ ] `delete_budget`: 예산 삭제

### 반복 거래
- [ ] `list_recurring_transactions`: 반복 거래 목록
- [ ] `create_recurring_transaction`: 신규 등록 (frequency, dayOfMonth/dayOfWeek/monthOfYear, nextRunAt)
- [ ] `update_recurring_transaction`: ID 기반 수정 (isActive 포함)
- [ ] `delete_recurring_transaction`: ID 기반 삭제

### 알림 설정
- [ ] `list_alert_configs`: 설정 조회
- [ ] `update_alert_config`: 기존 키에 대한 값만 변경 (허용 키 화이트리스트)

## 기술 설계

### 변경 파일

1. `src/mcp/tools/budget.ts` (신규)
2. `src/mcp/tools/recurring.ts` (신규)
3. `src/mcp/tools/alert.ts` (신규)
4. `src/mcp/server.ts` — 9개 도구 등록
5. `src/lib/ai/claude-advisor.ts`, `system-prompt.ts` 반영

### 안전장치

- 예산: 카테고리명으로 매칭, 연/월 유효성 검증
- 반복거래: calculateNextRunAt 유틸 재사용하여 nextRunAt 검증
- 알림 설정: 키 허용 목록 (임의 키 생성 금지)
