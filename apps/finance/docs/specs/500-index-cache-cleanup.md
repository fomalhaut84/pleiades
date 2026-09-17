# [Chore] 지수/캐시 표기 잔여 정리

- **이슈**: #500
- **작성일**: 2026-09-17
- **타입**: 잔여 정리 (표기 일관성 + 리팩터)
- **노력 예상**: XS (반일)
- **우선순위**: P0

## 1. 목적

#499 (클로징 리뷰 지수 조회 `get_prices` 전환) 사전 리뷰에서 나온 P0 항목 중 해당 PR 스코프 밖이라 이월한 잔여분을 정리한다. 기능 추가 없음 — 표기 일관성과 중복 상수 제거.

## 2. 항목

### A. `/price ^KS11` 포인트 표기 (`src/bot/commands/price.ts`)

`/price ^KS11` 이 로컬 `formatPrice()` 를 태워 `₩6,717` 로 출력한다. 지수는 통화 단위가 아니라 포인트이므로 MCP `get_prices` 와 동일 규칙으로 통일한다.

- [ ] 지수/통화 분기 규칙을 `src/lib/format.ts` 의 공용 `formatQuoteValue()` 로 단일화 (MCP `src/mcp/utils.ts` 가 이를 위임 사용). 통화 표기 스타일은 호출자마다 달라 (`MCP 1,234원` / `봇 ₩1,234`) 주입받는다
- [ ] 봇 메시지 조립부를 순수 모듈 `src/bot/commands/price-format.ts` 로 분리해 현재가·변동 양쪽에 적용
- [ ] 회귀 테스트: `^KS11` 출력에 `₩` / `원` 이 없고 `6,717.28` 포인트가 있을 것

### B. KST 오프셋 인라인 중복 치환

`9 * 60 * 60 * 1000` 리터럴이 23개 파일에 흩어져 있다. #499 에서 `KST_OFFSET_MS` 를 `src/lib/kst-date.ts` 에서 export 했으므로 전량 재사용으로 치환한다.

- [ ] 전수 치환 (동작 무변경 리팩터 — 값·연산 순서 유지)
- [ ] 치환 후 `grep -rn "9 \* 60 \* 60 \* 1000" src` 결과가 `kst-date.ts` 정의 1건만 남을 것 (테스트 파일의 독립 기대값 리터럴은 예외)

### C. `MARKET_STATE_LABELS` 의 `POST` 시장별 분기 (`src/mcp/utils.ts`)

#499 에서 `POST` 를 '장 마감 후' 로 통일하면서 미국 종목의 애프터마켓(시간외 거래 진행 중) 뉘앙스가 평탄화됐다. 한국장은 마감 후 거래가 없어 '장 마감 후' 가 맞지만 미국장은 '시간외' 가 정확하다.

- [ ] `formatMarketStamp(marketTime, marketState, market?)` 로 시장 인자 추가 → `POST`/`POSTPOST` 를 US 는 '시간외', 그 외(KR/미지정)는 '장 마감 후'
- [ ] `PRE`/`PREPRE` 는 현행 유지 (한국장에도 시가 단일가 개념이 있어 '장 시작 전' 이 양쪽에 무해)
- [ ] `src/mcp/tools/market.ts` 호출부에서 `quote.market` 전달

## 3. 테스트

- 신규: `src/bot/commands/__tests__/price-format.test.ts` — 지수 포인트 / USD / KRW 표기 회귀
- 갱신: `src/mcp/tools/__tests__/market.test.ts` — US `POST` → `(시간외)`, KR `POST` → `(장 마감 후)`, market 미지정 → `(장 마감 후)`
- 기존 4종 검증 (`lint` / `tsc --noEmit` / `test:run` / `build:mcp` + `build:bot`) 전부 통과

## 4. 제외

- 지수 캐시 정책 변경 (#499 에서 `skipCache` 로 확정, 추가 변경 없음)
- `src/bot/utils/formatter.ts` 의 `₩` prefix 통화 스타일 자체 변경 (봇 전역 UI 변경이라 별도 이슈)
- `9 * 60 * 60 * 1000` 이외의 시간 상수 (`24 * 60 * 60 * 1000` 등) 정리
