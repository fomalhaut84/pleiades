# 구현 계획: 관심종목 CRUD MCP 도구 (#265)

## 변경 파일 (4개)

| 순서 | 파일 | 변경 내용 |
|------|------|-----------|
| 1 | `src/mcp/tools/watchlist.ts` | addWatchlist/updateWatchlist/deleteWatchlist 함수 추가 |
| 2 | `src/mcp/server.ts` | 3개 도구 Zod 스키마 + 핸들러 등록 |
| 3 | `src/lib/ai/claude-advisor.ts` | ALLOWED_TOOLS에 3개 추가 |
| 4 | `src/lib/ai/system-prompt.ts` | 도구 목록에 3개 추가 |

## 구현 세부

### addWatchlist
- `fetchQuote(ticker)`로 유효성 + displayName/market 자동 결정
- `prisma.watchlist.create`
- 중복 시 Prisma unique 에러 → toolError로 처리

### updateWatchlist
- `prisma.watchlist.findUnique({ where: { ticker } })` 존재 확인
- `prisma.watchlist.update`
- 제공된 필드만 업데이트 (undefined 필드는 무시)

### deleteWatchlist
- `prisma.watchlist.findUnique` 존재 확인
- `prisma.watchlist.delete`

## 패키지/DB 변경: 없음
