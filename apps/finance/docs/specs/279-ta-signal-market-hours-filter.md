# TA 시그널 알림 거래시간 필터링

## 목적

TA 시그널 알림(`ta-signal-alert.ts`)이 종목별 시장 개장 시간을 고려하지 않아, 한국장 마감 후에도 KR 종목 시그널이 발송되는 문제를 해결한다.
PR #261에서 도입된 거래시간 필터(`isMarketOpenFor`)를 TA 시그널에도 동일하게 적용한다.

## 배경

- PR #261에서 `price-alert.ts`(급등락 알림)에 거래시간 필터를 적용해 장외 허위 변동 알림을 차단함.
- 그러나 `ta-signal-alert.ts`(전략 기반 TA 시그널 알림)에는 동일 필터가 빠져 있음.
- `cron.ts:86`은 한국장 또는 미국장 둘 중 하나라도 열려 있으면 TA 체크를 실행하므로, 미국장이 열려 있는 KST 23:30~05:00 시간대에 KR 종목까지 모두 분석되어 신호가 발송됨.
- 사용자 보고: 한국장 마감 이후(`SK hynix 000660.KS`)에 RSI 과매수 시그널이 발송됨.

## 요구사항

- [ ] `Holding.market`, `Watchlist.market` 필드를 활용해 종목별 시장 식별
- [ ] `isMarketOpenFor(market, ticker)` 결과 false인 종목은 TA 분석 자체를 건너뛰기 (불필요한 `generateTAReport` 호출 차단)
- [ ] FX 티커는 TA 시그널 대상이 아님(전략 미할당) — 자연 제외 확인
- [ ] 다중 전략(보유+관심) 동시 등록 종목은 한 번만 검사
- [ ] 기존 dedupe(고정 ID) 로직과 충돌 없음

## 기술 설계

### 변경 파일
- `src/bot/notifications/ta-signal-alert.ts`

### 데이터 흐름

1. `holdings` 조회 시 `holding.market` include (보조용)
2. `tickerStrategies` Map에 보유/관심 종목 통합 수집
3. 대상 티커들의 `PriceCache.market`을 일괄 조회해 `marketByTicker` Map 구성 (단일 결정적 소스)
4. 각 ticker 처리 루프에서 `marketByTicker.get(ticker)`로 시장 식별
5. PriceCache 미존재 시 warn 로그 + `continue` (안전 차단)
6. `isMarketOpenFor(market, ticker)` false면 `continue`

### 충돌 케이스
- 동일 ticker가 보유와 관심종목 양쪽에 있고 `market` 값이 다를 가능성에 대비:
  - `price-alert.ts`(#261)와 동일하게 `PriceCache.market`을 단일 결정적 소스로 사용
  - PriceCache는 시세 수집 단계에서 ticker당 단일 market을 보장
  - PriceCache 미존재 티커는 안전하게 스킵 (다음 cron 주기에 캐시가 채워지면 자연 복구)

### 거동 변화
- KR 종목: 평일 09:00~15:30 KST에만 TA 시그널 발송
- US 종목: 미국장 시간(DST 반영)에만 발송
- OTHER market: 발송 안 됨(`isMarketOpenFor` 보수적 차단 정책 따름)

## 테스트 계획

- [ ] `npm run lint`
- [ ] `npx tsc --noEmit`
- [ ] `npm run build`
- [ ] 수동 점검: 코드 리뷰에서 분기 정확성 확인 (단위 테스트는 시간 의존성 때문에 별도 모듈 시간 모킹 필요 — 현 시점 범위 외)

## 제외 사항

- 사용자 시간대 설정 변경
- TA 엔진(`generateTAReport`) 자체 변경
- 시간대 모킹 기반 단위 테스트 추가(별도 이슈에서 다룰 수 있음)
- `price-alert.ts`나 `cron.ts` 수정 (이미 적절히 필터링됨)

## 라벨

- `fix`, `P1`
