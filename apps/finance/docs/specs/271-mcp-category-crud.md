# Phase 23-D: 카테고리 CRUD MCP 도구

## 목적

AI가 카테고리를 직접 생성/수정/삭제 가능하도록 MCP 도구 추가.

## 요구사항

- [ ] `create_category`: name, type(expense/income/transfer), icon?, keywords?
- [ ] `update_category`: name으로 대상 지정, 부분 수정
- [ ] `delete_category`: name으로 삭제 (연결 거래/예산 있으면 거부)
- [ ] 기존 category-utils.ts 검증 재사용

## 변경 파일

1. `src/mcp/tools/category.ts` (신규)
2. `src/mcp/server.ts` — 3개 도구 등록
3. `src/lib/ai/claude-advisor.ts` — ALLOWED_TOOLS
4. `src/lib/ai/system-prompt.ts` — 도구 목록
