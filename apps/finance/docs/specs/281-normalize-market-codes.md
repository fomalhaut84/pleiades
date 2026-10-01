# Phase 25-A: market 코드 정규화 통일

## 목적

DB의 `market` 필드에 Yahoo Finance raw exchange 코드(`NCM`, `NGM`, `NYQ`, `KSC` 등)와 정규화 코드(`US`, `KR`)가 혼재해 있어, 거래 등록 시 정합성 검증이 실패하는 문제를 해결한다.

사용자 보고 사례:
- 새 거래에서 SATL을 직접 입력 → `'SATL은(는) 이미 NCM/USD로 등록되어 있습니다.'` 에러로 등록 불가
- 원인: `PriceCache.market = 'NCM'`(Yahoo raw) vs 폼에서 보낸 `market = 'US'`(정규화) 직접 비교

## 배경

- `src/lib/market-hours.ts:73-87`에 `normalizeMarket()`이 정의돼 있지만 31곳 중 1곳(`mcp/tools/watchlist.ts:38`)에서만 사용 중
- `src/lib/price-fetcher.ts:58`은 Yahoo의 `quote.exchange`를 정규화 없이 그대로 `PriceCache.market`에 저장
- 거기서 파생되는 `Watchlist`, `Holding`(시드/임포트)에도 raw 코드가 그대로 들어감
- 폼은 정규화된 `US/KR`만 전송 → 비교 항상 실패

## 요구사항

- [ ] `src/lib/price-fetcher.ts`에서 `PriceCache.market` 저장 시 `normalizeMarket()` 적용
- [ ] `src/lib/trade-service.ts:62, 72` 비교 시 양쪽을 `normalizeMarket()` 통과 후 비교
- [ ] `src/app/api/trades/import/route.ts:118-133` 동일 패턴 적용
- [ ] 기존 DB 데이터 일괄 정규화 마이그레이션 스크립트 (`PriceCache`, `Watchlist`, `Holding`, `Trade`)
- [ ] 마이그레이션 결과를 한 번에 dry-run 가능
- [ ] 기존 watchlist/holding/trade 입력 검증(`market === 'US' || 'KR'`) 유지

## 기술 설계

### 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `src/lib/market-hours.ts` | `normalizeMarket` 반환을 `'KR' \| 'US' \| 'FX' \| 'OTHER'` 그대로 유지. 단, `'OTHER'`로 떨어지는 경우 fallback 로깅 도입 검토 |
| `src/lib/price-fetcher.ts` | L58: `const market = normalizeMarket(quote.exchange ?? '', ticker)` |
| `src/lib/trade-service.ts` | L62, L72: `normalizeMarket(existing.market, ticker) !== normalizeMarket(market, ticker)`로 비교. 에러 메시지에 정규화 코드 표시 |
| `src/app/api/trades/import/route.ts` | L118, L131: 동일 비교 정규화 |
| `prisma/scripts/normalize-market-codes.ts` (신규) | 기존 row의 `market`을 일괄 normalize. `--dry-run` 옵션 지원 |

### 마이그레이션 스크립트 동작

1. `PriceCache`, `Watchlist`, `Holding`, `Trade` 각 테이블 순회
2. 각 row의 `market` 값을 `normalizeMarket(row.market, row.ticker)`로 변환
3. `'OTHER'`로 떨어지면 경고 로그 + skip (사람이 수동 확인)
4. `--dry-run` 모드는 SQL 실행 없이 변경될 row 수만 출력
5. 실 실행 시 모든 업데이트를 단일 트랜잭션 안에서 수행

### 데이터 매핑 예시

| Raw | Normalized |
|---|---|
| `NCM`, `NGM`, `NMS`, `NYQ`, `PCX` | `US` |
| `KSC`, `KOE`, `KS`, `KQ` | `KR` |
| `CCY` | `FX` |
| 기타 | `OTHER` (수동 확인) |

### 비교 패턴

```ts
// before
if (existing.market !== market) { /* error */ }

// after
if (normalizeMarket(existing.market, ticker) !== normalizeMarket(market, ticker)) { /* error */ }
```

### 거동 변화

- 기존 raw `NCM` row + 폼의 `US` 입력 → 정규화 후 같음(`US === US`) → 에러 사라짐
- 마이그레이션 후 신규 row는 항상 정규화된 코드로 저장됨
- TA 시그널 알림, price-alert는 이미 `normalizeMarket()`을 거치므로 영향 없음

## 테스트 계획

- [ ] `npm run lint`
- [ ] `npx tsc --noEmit`
- [ ] `npm run build`
- [ ] 마이그레이션 dry-run 결과 확인 (변경 row 수 일치 여부)
- [ ] 수동: 새 거래에서 SATL 직접 입력 시도 → 등록 성공

## 제외 사항

- holdings dropdown 필터링(`shares > 0`) — Phase 25-B에서 처리
- API 응답 형식 통일 — Phase 25-E
- 입력 검증 Zod 마이그레이션 — Phase 25-F
- **단위 테스트 추가** — 현재 프로젝트에 테스트 프레임워크(jest/vitest)가 도입돼 있지 않음. 별도 인프라 이슈로 분리 (테스트 프레임워크 도입은 7차 마일스톤 외 별도 작업)

## 라벨

- `fix`, `P1`, `phase-25`
