# 관심종목 시세 fallback + AI WebSearch 권한

## 목적

1. 관심종목 조회 시 PriceCache에 없으면 실시간으로 yahoo-finance2에서 조회
2. AI 어드바이저가 WebSearch/WebFetch를 사용할 수 있도록 ALLOWED_TOOLS에 추가

## 요구사항

- [ ] 봇 /관심목록: PriceCache 미스 시 fetchQuote로 실시간 조회
- [ ] MCP get_watchlist: 동일 fallback 적용
- [ ] ALLOWED_TOOLS에 WebSearch, WebFetch 추가
- [ ] AI가 종목 발굴 시 웹 검색 정상 동작

## 기술 설계

### 변경 파일

1. **`src/bot/commands/watchlist.ts`** — PriceCache 미스 시 fetchQuote fallback
2. **`src/mcp/tools/watchlist.ts`** — 동일 fallback
3. **`src/lib/ai/claude-advisor.ts`** — ALLOWED_TOOLS에 WebSearch, WebFetch 추가

## 테스트 계획

- [ ] 관심종목 중 PriceCache에 없는 종목 → 실시간 시세 표시
- [ ] AI에게 "거래량 많은 종목 추천해줘" → 웹 검색 실행
- [ ] lint + typecheck + build 통과
