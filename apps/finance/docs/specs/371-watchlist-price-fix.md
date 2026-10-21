# [Phase 29-A] 관심종목 시세 버그 fix + 진단 로깅

- **작성일**: 2026-07-01
- **타입**: bug (P1)
- **참조**: 이슈 #230 (1번 항목), 마스터 이슈 #370

## 1. 문제

봇에서 `/관심` 명령 시 관심종목 시세가 "시세 없음" 으로 표시. 웹 `/watchlist` 페이지도 동일 가능성.

## 2. 진단 (코드 분석 기반)

### 확인된 것
- 봇 관심종목 추가 시 `tickerInput.toUpperCase()` 로 대문자 정규화 ✓
- price-fetcher cron 은 watchlist 티커도 fetch 대상에 포함 ✓
- priceCache 매칭 실패 시 `fetchQuote` fallback 시도 ✓

### 잠재 원인
1. **fallback 실패 로그 swallow** — `src/bot/commands/watchlist.ts:199` `catch {}` 로 fetchQuote 예외 무시 → 왜 실패했는지 알 수 없음 (network / rate limit / InvalidTicker)
2. **첫 cron 사이클 이전** — 관심종목 방금 추가 시 priceCache 에 없음. fallback 실패면 사용자는 최대 10분 (`price cron`) 기다려야 함
3. **웹 fetcher 시나리오 미확인** — WatchlistForm 시세 표시 흐름 검증 필요

## 3. 요구사항

- [ ] **R1**: `fetchQuote` fallback 실패 로그 강화 — `sanitizeError` 경유
- [ ] **R2**: 관심종목 추가 성공 시 즉시 `fetchQuote` 호출로 priceCache 선행 채우기 (best-effort)
- [ ] **R3**: 웹 관심종목 페이지 시세 표시 검증 (필요 시 동일 pattern 적용)

## 4. 변경

### 4.1 `src/bot/commands/watchlist.ts`
```diff
- try {
-   const quote = await fetchQuote(w.ticker)
-   price = { ... }
- } catch {
-   // 조회 실패 시 무시
- }
+ try {
+   const quote = await fetchQuote(w.ticker)
+   price = { ... }
+ } catch (err) {
+   console.error(`[watchlist] 시세 fetch 실패 (${w.ticker}): ${sanitizeError(err)}`)
+ }
```

### 4.2 관심종목 add 후 warm-up
`handleWatchAdd` (append 라인 근처): `upsert` 성공 후 `fetchQuote(resolvedTicker).catch((err) => console.error('[watchlist] warm-up 실패:', sanitizeError(err)))` — 실패는 non-blocking.

### 4.3 웹 `WatchlistForm` / `/api/watchlist/[id]` (필요 시)
- 웹에서 시세 표시 흐름 확인 후 동일 pattern 적용

## 5. 테스트

- `npm run lint && npx tsc --noEmit && npm run test:run && npm run build`
- 수동:
  - 텔레그램에 새 관심종목 추가 → 즉시 `/관심` 실행 → 시세 나오는지
  - "시세 없음" 여전할 경우 pm2 logs 에서 `[watchlist]` prefix 로 실패 사유 확인

## 6. 제외 사항

- 전략별 알림 로직 확장 (Phase 29-B)
- 관심종목 UI 재설계
