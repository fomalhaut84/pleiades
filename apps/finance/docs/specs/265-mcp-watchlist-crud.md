# Phase 23-A: 관심종목 CRUD MCP 도구

## 목적

AI가 사용자 요청에 따라 관심종목을 직접 추가/수정/삭제 가능하도록 MCP 쓰기 도구 추가.
기존 `get_watchlist` 조회만 있어 AI가 "봇 커맨드 사용하세요"로 안내할 수밖에 없던 제약 해소.

## 요구사항

- [ ] `add_watchlist` MCP 도구: 신규 관심종목 추가
- [ ] `update_watchlist` MCP 도구: 기존 관심종목 부분 업데이트
- [ ] `delete_watchlist` MCP 도구: 관심종목 삭제
- [ ] 실시간 시세 유효성 검증 (추가 시 yahoo-finance2로 ticker 유효성 확인)
- [ ] 기존 Watchlist API 검증 로직 재사용
- [ ] AI ALLOWED_TOOLS에 3개 추가
- [ ] 시스템 프롬프트 도구 목록에 3개 추가

## 기술 설계

### 변경 파일

1. **`src/mcp/tools/watchlist.ts`** — addWatchlist/updateWatchlist/deleteWatchlist 함수 추가
2. **`src/mcp/server.ts`** — 3개 도구 등록 (스키마 + 핸들러)
3. **`src/lib/ai/claude-advisor.ts`** — ALLOWED_TOOLS에 `mcp__myfinance__add_watchlist` 등 추가
4. **`src/lib/ai/system-prompt.ts`** — 도구 목록에 추가 + 쓰기 규칙 상기

### 파라미터

**add_watchlist**
- `ticker` (필수): Yahoo Finance 티커
- `strategy` (선택): swing/momentum/value/scalp (기본 swing)
- `targetBuy` (선택): 목표 매수가
- `entryLow`, `entryHigh` (선택): 매수 구간
- `memo` (선택)
- `market`, `displayName`: yahoo-finance2 `fetchQuote`로 자동 결정

**update_watchlist**
- `ticker` (필수): 대상 식별
- 나머지 필드는 제공된 것만 업데이트

**delete_watchlist**
- `ticker` (필수)

### 중복 처리

- 추가 시 이미 존재하는 ticker → 에러 반환
- 업데이트는 ticker 존재 확인 후 진행

## 테스트 계획

- [ ] AI에게 "AVAV 관심종목 추가, 매수구간 168~175" → add_watchlist 호출, 사용자 확인 후 등록
- [ ] AI에게 "AVAV 목표가 170으로 변경" → update_watchlist
- [ ] AI에게 "AVAV 관심종목 삭제" → 명시적 동의 후 delete_watchlist
- [ ] 존재하지 않는 티커 추가 시도 → 에러
- [ ] lint + typecheck + build 통과

## 제외 사항

- 웹 UI 변경 없음 (기존 관심종목 페이지 그대로)
- 봇 커맨드 변경 없음
