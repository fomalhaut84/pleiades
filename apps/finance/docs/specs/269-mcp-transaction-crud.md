# Phase 23-C: 가계부 거래 CRUD MCP 도구

## 목적

AI가 가계부 거래를 직접 생성/수정/삭제 가능하도록 MCP 쓰기 도구 추가.

## 요구사항

- [ ] `create_transaction`: 금액, 내용, 카테고리명, 날짜(선택), 타입(선택)
- [ ] `update_transaction`: ID 기반 부분 수정 (금액, 내용, 카테고리, 날짜)
- [ ] `delete_transaction`: ID 기반 삭제
- [ ] 카테고리는 이름으로 매칭 (AI가 ID를 모르므로)
- [ ] 생성 시 후잉 웹훅 전송
- [ ] AI ALLOWED_TOOLS + 시스템 프롬프트 반영

## 기술 설계

### 파라미터

**create_transaction**
- `amount` (필수): 금액
- `description` (필수): 내용
- `categoryName` (필수): 카테고리명 (부분 일치)
- `transactedAt` (선택): YYYY-MM-DD (미지정 시 오늘)
- `type` (선택): transfer_out/transfer_in (미지정 시 카테고리 타입에 따름)

**update_transaction**
- `id` (필수): 거래 ID
- `amount`, `description`, `categoryName`, `transactedAt` (선택)

**delete_transaction**
- `id` (필수): 거래 ID

### 변경 파일

1. `src/mcp/tools/spending.ts` — create/update/deleteTransaction 함수 추가
2. `src/mcp/server.ts` — 3개 도구 등록
3. `src/lib/ai/claude-advisor.ts` — ALLOWED_TOOLS
4. `src/lib/ai/system-prompt.ts` — 도구 목록

## 테스트 계획

- [ ] AI에게 "점심 12000원 기록" → create_transaction
- [ ] AI에게 "마지막 거래 금액 15000으로 수정" → update_transaction
- [ ] AI에게 "마지막 거래 삭제" → delete_transaction
- [ ] lint + typecheck + build 통과
