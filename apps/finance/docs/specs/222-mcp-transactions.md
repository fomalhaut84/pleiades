# MCP: 가계부 상세 조회 도구

## 목적

AI 어드바이저가 개별 거래 내역을 조회할 수 있도록 MCP 도구 추가.
현재 get_spending_summary는 카테고리별 합계만 제공하여 "어제 뭐 썼지?",
"이번 달 식비 상세 내역" 등의 질의에 답할 수 없음.

## 요구사항

- [ ] `get_transactions` MCP 도구: 개별 거래 내역 조회
- [ ] 필터: 기간(days), 카테고리명, 타입(expense/income/transfer)
- [ ] 최대 50건 제한 (AI 컨텍스트 절약)
- [ ] MCP server.ts에 도구 등록 + AI 허용 목록 추가

## 기술 설계

### 변경 파일

1. **`src/mcp/tools/spending.ts`** — getTransactions 함수 추가 (기존 파일에)
   - 파라미터: days(기본 7), category(카테고리명, 선택), type(expense/income, 선택)
   - 반환: 날짜, 금액, 내용, 카테고리명, 아이콘 (최신순, 최대 50건)

2. **`src/mcp/server.ts`** — get_transactions 도구 등록
3. **`src/lib/ai/claude-advisor.ts`** — ALLOWED_TOOLS에 추가
4. **`src/lib/ai/system-prompt.ts`** — 도구 설명 추가

## 테스트 계획

- [ ] AI에게 "어제 뭐 썼어?" → 최근 거래 내역 응답
- [ ] AI에게 "이번 달 식비 내역" → 식비 카테고리 필터된 내역
- [ ] lint + typecheck + build 통과

## 제외 사항

- 가계부 CRUD 변경 없음
- get_spending_summary 변경 없음 (공존)
