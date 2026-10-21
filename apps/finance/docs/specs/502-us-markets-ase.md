# [Fix] normalizeMarket US_MARKETS 에 Yahoo raw 코드 ASE/BTS 누락

- **이슈**: #502
- **작성일**: 2026-10-19
- **타입**: 버그
- **노력 예상**: XS
- **우선순위**: P1

## 1. 문제

`src/lib/market-hours.ts` `US_MARKETS` 에 사람이 읽는 이름(`AMEX`, `BATS`)만 있고 Yahoo 가 실제 반환하는 raw
exchange 코드가 빠져 `normalizeMarket` 이 `OTHER` 를 반환했다. → `isMarketOpenFor` 가 false 라 급등락 알림
24시간 차단, `resolveRefreshMeta` placeholder 추정 유지, `formatMarketStamp` US '시간외' 라벨 미적용.

실측 (2026-10-19, yahoo-finance2 quote):

| 티커 | exchange | fullExchangeName |
|---|---|---|
| IMO | `ASE` | NYSE American |
| ARKB, CBOE | `BTS` | Cboe US |
| SPY, XAR, SOXL | `PCX` | NYSEArca (기존 포함) |

## 2. 수정

- [x] `US_MARKETS` 에 `ASE`, `BTS` 추가
- [x] 회귀 테스트 `src/lib/__tests__/market-hours.test.ts` — 실측 raw 코드 전부 `US`
- [x] (레이어링) `isIndexTicker` / `isKoreanIndexTicker` 를 의존성 없는 `src/lib/ticker-kind.ts` 로 이동.
      `format.ts` 가 `price-fetcher-utils` → `market-hours` 를 전이 의존하던 역방향 의존 제거.
      `price-fetcher-utils` 는 기존 import 경로 호환을 위해 re-export

## 3. 배포 후

- `isMarketOpenFor` 는 읽는 시점에 `normalizeMarket` 을 적용하므로 raw `ASE`/`BTS` 로 저장된 행도 배포 즉시 `US` 로 판정
- 현재 보유·관심종목에 NYSE American / Cboe 상장 종목이 있으면 장중 급등락 알림 1회 확인

## 4. 제외

- OTC (`PNK` 등) — 장 시간 정책이 달라 별도 판단
