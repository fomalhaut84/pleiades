# 구현 계획: 가계부 거래 CRUD MCP 도구 (#269)

## 변경 파일 (4개)

| 순서 | 파일 | 변경 |
|------|------|------|
| 1 | `src/mcp/tools/spending.ts` | createTransaction/updateTransaction/deleteTransaction 함수 |
| 2 | `src/mcp/server.ts` | 3개 도구 등록 |
| 3 | `src/lib/ai/claude-advisor.ts` | ALLOWED_TOOLS |
| 4 | `src/lib/ai/system-prompt.ts` | 도구 목록 |

## 핵심 로직

### createTransaction
- categoryName으로 prisma.category.findFirst(contains, insensitive)
- 매칭 안 되면 에러
- prisma.transaction.create
- 후잉 웹훅 전송 (sendToWhooing, 실패 무시)

### updateTransaction
- id로 기존 거래 조회
- categoryName 지정 시 카테고리 재매칭
- prisma.transaction.update (제공된 필드만)

### deleteTransaction
- id로 존재 확인 후 삭제

## 패키지/DB 변경: 없음
