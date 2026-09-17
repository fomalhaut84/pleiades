# [Fix] 클로징 리뷰 지수 조회 get_prices 전환 + 시세 기준 시각/장 상태 표기

- **이슈**: #499
- **작성일**: 2026-09-17
- **타입**: 버그 수정 (AI 프롬프트 + MCP 도구 출력 정확성)
- **노력 예상**: S (1일)
- **우선순위**: P1 (매일 재발하는 구조적 오보)

## 1. 배경

2026-09-17 15:40 KST 한국장 클로징 리뷰 (텔레그램 cron) 가 코스피 마감치를 **"검색 데이터 부재로 확인 불가 — 데이터 부족"** 으로 보고했다. 단발 사고가 아니라 세 가지 결함이 겹친 구조적 재발이다.

### 1.1 클로징 프롬프트에 지수 조회 도구 단계가 없음

`src/bot/notifications/active-review.ts:52` `buildClosingPrompt()` 의 3단계가

```
3. WebSearch로 ${closedSession} 관련 뉴스/지수 이슈 검색
```

이고, 프롬프트 전체에 `get_prices` 단계가 없다. KR 클로징은 마감 10분 뒤 (15:40 KST) 에 돌기 때문에 **당일 마감 기사가 검색 인덱스에 아직 안 잡히는 날이 많다** → 지수 확인 경로가 통째로 없어 매일 재발한다.

`src/lib/ai/system-prompt.ts:77` 의

> get_prices: … **주가 확인 시 반드시 이 도구 사용 — WebSearch로 주가를 검색하지 말 것**

규칙은 '주가' 만 언급해 **지수 (^KS11 등) 에는 적용되지 않는 것으로 해석**됐다.

또 프롬프트에 오늘 날짜가 없어, AI 가 전날 (9/16) 기사와 당일 도구값을 날짜 표기 없이 한 메시지에 섞었다.

### 1.2 get_prices 출력이 "언제 시세인지" 를 말하지 않음

`src/mcp/tools/market.ts:45` 의 명시 티커 분기는

```ts
lines.push(`\n조회 시각: ${formatDate(new Date())}`)
```

로 **호출 시각**만 찍고, `src/lib/price-fetcher.ts:43` `fetchQuote()` 는 야후 응답의 `regularMarketTime` / `marketState` 를 **버린다** (`QuoteResult` 에 필드 없음, price-fetcher.ts:29).

그 결과 AI 도 사용자도 반환값이 9/16 종가인지 9/17 종가인지 판별할 수 없다. 실제로 후속 `/ai` 답변이 **전날 종가와 동일한 ^KS11 값을 "9/17 실시간 정상 조회 · 보합권" 으로 오진단**했다 — 값이 stale 이어도 감지 불가능한 구조다.

### 1.3 지수 티커가 통화로 표기되고 PriceCache 를 오염시킴

- `market.ts:29` 가 `formatMoney(quote.price, quote.currency)` 를 그대로 써서 `^KS11` 이 **"6,717원"** 으로 표기된다. 지수는 통화가 아니라 포인트다.
- `fetchQuote()` 는 티커 종류를 가리지 않고 `prisma.priceCache.upsert` (price-fetcher.ts:76) 를 호출한다. `^KS11` 은 보유 종목도 관심종목도 아니므로 **주가 갱신 cron 의 refresh 대상이 아니다** → 캐시에 영구 stale 행으로 남고, 실시간 조회 실패 시 fallback (market.ts:35~40) 이 그 오래된 값을 `[캐시]` 로 조용히 반환한다.

## 2. 목표

- 클로징 리뷰가 지수 마감치를 **도구값 기준으로** 보고한다 (검색 결과 유무와 무관).
- `get_prices` 출력만 보고 **그 값이 언제 기준인지** 판별 가능하다.
- 지수는 포인트로 표기되고, 캐시를 오염시키지 않는다.

## 3. 변경 상세

### 3.A 클로징 프롬프트 지수 조회 전환 — `src/bot/notifications/active-review.ts`

`buildClosingPrompt(session)` 수정:

- **지수 조회 단계를 WebSearch 앞에 추가**
  - KR: `get_prices(['^KS11','^KQ11'])`
  - US: `get_prices(['^GSPC','^IXIC','^DJI'])`
  - 세션별 티커 배열은 `MarketSession` 분기 상수로 (`CLOSING_INDEX_TICKERS`).
- **WebSearch 단계는 "이슈/뉴스 보조" 로 역할 한정** — 지수 수치 출처가 아님을 명시.
- **오늘 날짜 (KST) 를 프롬프트에 명시.** 세션 날짜와 다른 날짜의 기사를 인용할 땐 날짜를 표기하거나 제외하도록 지시.
- **"데이터 부족" 표현 가드**: 도구값이 있으면 데이터 부족이라 쓰지 말고, 뉴스만 못 찾은 경우엔 **"당일 뉴스 미확인"** 으로 표현하도록 지시.
- 미국장 클로징도 동일 규칙 적용 (US 지수 티커 + 해당 세션 날짜).

단계 번호 재정렬 (기존 3→4, 4→5) 필요.

**테스트 가능성**: `buildClosingPrompt` 는 현재 **non-export** (`function buildClosingPrompt`). 회귀 테스트를 위해 **`export function buildClosingPrompt` 로 승격**한다 (동일 파일의 `ensureActiveReviewSetting` / `sendClosingReview` 와 같은 export 패턴).

### 3.B 시세 기준 시각 + 장 상태 — `src/lib/price-fetcher.ts`, `src/mcp/tools/market.ts`

**`QuoteResult` 확장** (price-fetcher.ts:29):

```ts
marketTime: Date | null    // quote.regularMarketTime
marketState: string | null // quote.marketState (REGULAR/CLOSED/PRE/POST/…)
```

`fetchQuote()` 에서 야후 응답을 매핑한다. `regularMarketTime` 은 라이브러리 버전에 따라 `Date` 또는 epoch seconds 로 올 수 있으므로 **양쪽 모두 방어적으로 정규화**하고, 파싱 실패 시 `null`.

**`market.ts` 명시 티커 분기 출력**에 시세 기준 라인 추가:

```
시세 기준: 09-17 15:30 KST (마감)
```

- 종목별로 기준 시각이 다를 수 있으므로 **각 라인 말미 또는 하단 요약** 중 하나로 표기 (단일 티커 요청이 대부분이므로 하단 요약 + 티커별 차이 있으면 라인별 표기).
- `marketState` 매핑: `REGULAR`→장중, `CLOSED`→마감, `PRE`→프리마켓, `POST`→애프터마켓, 그 외 **원문 그대로**.
- `marketTime` 이 `null` 이면 해당 표기를 생략 (거짓 정보 금지).
- **기존 `조회 시각:` 라인은 유지** — "도구를 호출한 시각" 과 "시세가 찍힌 시각" 은 다른 의미이므로 둘 다 남기고 레이블로 구분.

**KST 정규화**: 기존 KST 유틸 파일 `src/lib/kst-date.ts` 를 재사용한다. 다만 현재 export 는 `kstMidnightUtc` / `isSameOrFutureKstDay` / `kstDayDiff` 뿐이고 **표기용 포맷 함수가 없다** → 같은 파일에 `formatKstDateTime(d: Date): string` (`MM-DD HH:mm KST`, 도구 호출 시각 등 '지금' 인 값 전용) 과 `formatKstDateTimeFull` (`YYYY-MM-DD HH:mm KST`) 을 추가한다. 외부에서 받은 시각 (야후 시세 기준 시각, PriceCache 기록 시각) 은 거래정지 종목·영구 stale 캐시처럼 몇 달 전일 수 있으므로 **항상 연도를 포함** 한다 (사전 리뷰 P1 + Codex #501 P2). 새 KST 오프셋 상수를 다른 파일에 중복 정의하지 않는다 (기존 `KST_OFFSET_MS` 재사용).

### 3.C 지수 티커 처리 — `src/mcp/tools/market.ts`, `src/lib/price-fetcher.ts`

- **판별**: `ticker.startsWith('^')` → 지수. 공용 헬퍼 `isIndexTicker(ticker)` 로 한 곳에 정의하고 양쪽에서 import (중복 정의 금지).
- **표기**: 지수는 `formatMoney` 를 쓰지 않고 **포인트 표기** (통화 기호/`원` 없음, 소수점 2자리, 천단위 구분). 예: `6,717.28`.
  - 명시 티커 분기의 실시간 경로와 캐시 fallback 경로 **양쪽** 적용.
- **캐시**: `fetchQuote()` 에서 지수 티커면 `prisma.priceCache.upsert` 를 **건너뛴다**. (캐시에 적재되지 않으므로 fallback 조회도 자연히 미스 → `조회 실패` 로 정직하게 표시.)

### 3.D 시스템 프롬프트 문구 확장 — `src/lib/ai/system-prompt.ts:77`

1줄 수정. 현재:

> **주가 확인 시 반드시 이 도구 사용 — WebSearch로 주가를 검색하지 말 것**

→

> **주가·지수·환율 확인 시 반드시 get_prices / get_fx_rate 사용 — WebSearch로 시세를 검색하지 말 것**

저비용이며 1.1 의 해석 구멍을 직접 막으므로 이번 범위에 포함.

> ⚠️ 시스템 프롬프트/MCP 도구 변경 후에는 텔레그램 `/reset` 필요 (`--resume` 세션이 옛 프롬프트·도구 목록을 유지). 배포 후 수동 검증 항목에 포함.

## 4. 테스트 (회귀)

기존 패턴 참고: `src/lib/ai/__tests__/claude-advisor.test.ts` (프롬프트 문자열 단언), `src/mcp/tools/__tests__/alert-history.test.ts` (prisma / fetcher mock + 출력 문자열 단언).

| # | 파일 | 케이스 |
|---|---|---|
| 1 | `src/bot/notifications/__tests__/active-review.test.ts` (신규) | `buildClosingPrompt('KR')` 출력에 `^KS11` 포함 + 오늘 KST 날짜 문자열 포함 |
| 2 | 〃 | `buildClosingPrompt('US')` 출력에 `^GSPC` 포함 |
| 3 | 〃 | 두 세션 모두 `get_prices` 단계가 `WebSearch` 단계보다 앞 인덱스에 위치 |
| 4 | `src/mcp/tools/__tests__/market.test.ts` (신규) | `getPrices({tickers:['^KS11']})` 출력에 `'원'` **미포함**, 포인트 표기 (`6,717.28`) 포함 (`fetchQuote` / `prisma` mock) |
| 5 | 〃 | 같은 호출 출력에 `시세 기준:` 라인 + `(마감)` 포함 (`marketState: 'CLOSED'` mock) |
| 6 | 〃 | `marketTime: null` 이면 `시세 기준:` 라인 생략 |
| 7 | `src/lib/__tests__/price-fetcher-quote.test.ts` (신규) | `fetchQuote('^KS11')` 이 `prisma.priceCache.upsert` 를 **호출하지 않음** |
| 8 | 〃 | `fetchQuote('AAPL')` 은 기존대로 upsert 호출 (하위호환 회귀) |
| 9 | `src/lib/__tests__/kst-date.test.ts` (기존 확장) | `formatKstDateTime` UTC→KST 변환 + 자정 경계 |

## 5. 완료 조건

- [ ] 3.A 클로징 프롬프트 지수 조회 전환 (KR/US)
- [ ] 3.B `QuoteResult.marketTime` / `marketState` + `시세 기준:` 출력
- [ ] 3.C 지수 포인트 표기 + PriceCache upsert skip
- [ ] 3.D 시스템 프롬프트 1줄 확장
- [ ] 회귀 테스트 9종 추가 (§4)
- [ ] `npm run lint && npx tsc --noEmit && npm run test:run && npm run build` 전부 통과
- [ ] 코드 리뷰 P1/P2 = 0
- [ ] 배포 후 텔레그램 `/reset` 실행 (프롬프트/도구 변경 반영)
- [ ] 다음 15:40 KST 클로징 리뷰에서 코스피 마감치가 수치로 보고되고 "데이터 부족" 표현이 없음을 확인
- [ ] `/ai` 에서 `^KS11` 조회 시 "원" 표기 없음 + 시세 기준 시각 표시 확인

## 6. 제외 사항

- **응답 분량 강제** (6~8줄 등 토큰 제한 강화) — 별개 이슈
- **"데이터 부족" 문자열 후처리 감지** (출력 sanitize / 재시도 루프) — 프롬프트 레벨에서 먼저 해결하고 효과 관찰 후 판단
- **이벤트 캘린더 fallback** (뉴스 못 찾을 때 대체 데이터 소스) — 별개 스코프
- **브리핑 프롬프트 변경** (`src/bot/notifications/briefing.ts`) — 이번엔 클로징/`buildClosingPrompt` 만. 효과 확인 후 동일 패턴 이식 여부 결정
- **주간 리뷰 프롬프트** (`buildWeeklyPrompt`) — 동일 사유로 제외
- 지수 티커의 PriceCache 정식 지원 (cron refresh 대상 편입) — 지금은 skip 만

## 7. 의존성

없음.

Closes #499
