# AI 주가 실시간 조회

## 목적

AI 질의 시 최신 주가가 반영되지 않는 문제 해결.
현재 get_prices는 PriceCache(10분 갱신)에서 읽지만, AI가 WebSearch로 주가를 찾으려 해도
CSR 기반 금융 사이트는 크롤링 불가.

## 요구사항

- [ ] get_prices에서 fetchQuote로 실시간 조회
- [ ] 시스템 프롬프트에 "주가 조회 시 get_prices 사용" 강조
- [ ] 기존 PriceCache 갱신 로직 유지 (cron)

## 기술 설계

### 변경 파일

1. **`src/mcp/tools/market.ts`** — getPrices에서 fetchQuote 직접 호출
2. **`src/lib/ai/system-prompt.ts`** — 주가 조회 도구 우선 사용 안내

## 테스트 계획

- [ ] AI에게 "NVDA 현재가" → 최신 주가 응답
- [ ] lint + typecheck + build 통과
