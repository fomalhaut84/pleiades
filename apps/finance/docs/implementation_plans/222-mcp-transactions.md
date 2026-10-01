# 구현 계획: MCP 가계부 상세 조회 도구 (#222)

## 변경 파일 (4개)

| 순서 | 파일 | 변경 내용 |
|------|------|-----------|
| 1 | `src/mcp/tools/spending.ts` | getTransactions 함수 추가 |
| 2 | `src/mcp/server.ts` | get_transactions 도구 등록 |
| 3 | `src/lib/ai/claude-advisor.ts` | ALLOWED_TOOLS에 추가 |
| 4 | `src/lib/ai/system-prompt.ts` | 도구 설명 추가 |

## 패키지 추가: 없음
## DB 마이그레이션: 없음
