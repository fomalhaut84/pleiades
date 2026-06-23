# [Phase 28-D] prices/* envelope 마이그

## 목적

10차 마일스톤 네 번째 sub-PR — 시세 도메인 4 라우트 envelope 통일.

## 외부 consumer 영향 분석

- bot/cron 은 `refreshPrices()`, `syncKrxStocks()`, `searchYahooByName()` 등 **lib 직접 호출** — HTTP 미경유. 응답 shape 변경 영향 없음.
- 웹 consumer:
  - `/api/prices` GET — TradeForm, DividendForm: 이미 `json?.data?.prices` 사용 (27-B 호환)
  - `/api/prices/refresh` POST — RefreshButton: success body 미사용, error path `data?.error` 호환
  - `/api/prices/search` GET — 미사용
  - `/api/prices/krx-sync` POST — 미사용

→ 라우트 변경 안전. 클라이언트 fetcher 추가 변경 불필요.

## 요구사항

- [ ] `prices/route.ts` GET 에러 path → `fail()` (성공 이미 `ok`)
- [ ] `prices/refresh/route.ts` POST → `ok(result)` / `fail(msg, 429/500)`
- [ ] `prices/search/route.ts` GET → `ok({ source, results })` / `fail(...)`
- [ ] `prices/krx-sync/route.ts` POST → `ok(result)` / `fail(msg, 429/500)`

## 변환 패턴 (9차 동일)

| 케이스 | before | after |
|---|---|---|
| 성공 | `NextResponse.json(data)` | `ok(data)` |
| 에러 | `NextResponse.json({ error }, { status })` | `fail(error, status)` |

## 테스트 계획

- `npm run lint && npx tsc --noEmit && npm run test:run && npm run build`
- 수동 회귀: 대시보드 갱신 버튼, 거래/배당 폼 (환율 prefill), Whoes 검색은 미사용이지만 수동 호출 가능

## 제외 사항

- 28-E (backtest + ai/ask)
- lib 직접 호출 (cron/bot/MCP) 영향 없음
