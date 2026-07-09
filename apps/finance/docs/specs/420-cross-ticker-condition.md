# [Phase 34-B] 커스텀 전략 v3 — 크로스-티커 조건

- **이슈**: #420
- **마스터**: #414
- **선행**: #419 (34-A) — 어닝 조건. 34-B 는 다른 조건 프레임워크 활용.
- **작성일**: 2026-07-09

## 목표

전략 대상 티커와 다른 티커의 상태 (예: SPY 하락, VIX 급등) 를 진입 조건으로 사용. 시장 컨텍스트 게이트 자동화.

**대표 사용례**:
- "SPY 가 -2% 하락한 날엔 개별 종목 매수 회피"
- "VIX > 25 일 때만 콜/풋 스캘핑"
- "QQQ 200SMA 위에 있을 때만 성장주 진입"

## 조건 스키마

```ts
type ConditionType =
  ... // 기존
  | 'cross_ticker'   // 다른 티커의 price / changePercent 조건
```

### 구조
```ts
{
  type: 'cross_ticker',
  operator: '<' | '<=' | '>' | '>=' | '==',
  value: number,
  crossTicker: string,          // 참조 티커 (대문자 정규화)
  metric: 'price' | 'change_percent',  // 어떤 값과 비교
}
```

- `crossTicker` **신규 필수 필드** (기존 `timeframe` 처럼 조건별 오버라이드).
- `metric='price'`: PriceCache 의 `price` 필드
- `metric='change_percent'`: PriceCache 의 `changePercent` 필드 (일일)

### 유효성 검증
- crossTicker 는 비어 있지 않은 문자열 (자동 대문자 정규화)
- metric 은 화이트리스트
- operator 는 numeric (< / <= / > / >= / ==)
- value 는 finite number
- **자기 자신 참조 금지** — validateCondition 은 통과 (전략 편집 시점엔 strategy.ticker 알 수 없음), 대신 **evaluator 가 `crossTicker === context.strategyTicker` 이면 false 안전 판정**

### 예시
```json
{"type":"cross_ticker","operator":"<=","value":-2,"crossTicker":"SPY","metric":"change_percent"}
```

## 평가 로직 (evaluator)

```ts
case 'cross_ticker': {
  if (typeof cond.value !== 'number') return false
  if (!cond.crossTicker || !cond.metric) return false
  const normalized = cond.crossTicker.trim().toUpperCase()
  if (normalized === context.strategyTicker) return false  // 자기 자신 회피
  const cross = context.crossTickers?.get(normalized)
  if (!cross) return false  // 데이터 없음 → false 안전
  const actual = cond.metric === 'price' ? cross.price : cross.changePercent
  if (actual == null) return false
  return compareNumeric(actual, cond.operator, cond.value)
}
```

## Context 확장

```ts
interface EvaluationContext {
  ...
  crossTickers?: Map<string, { price: number; changePercent: number | null }>
}
```

`custom-strategy-alert.ts` 가 evaluate 전에 **전략들의 모든 crossTicker 를 수집** → 별도 PriceCache 조회 → context 에 주입.

## Ticker 수집 헬퍼

```ts
// pure
function collectCrossTickers(strategies: CustomStrategy[]): Set<string>
```

- 각 전략의 conditions 순회 → `type === 'cross_ticker'` 인 것들의 `crossTicker` 추출 (정규화).

## PriceCache 조회

기존 `priceCache.findMany` 를 확장 — 전략 티커 + 크로스 티커 합집합으로 한 번에 조회.

## Cron 필요 여부

새 fetch 불필요. `refreshPrices` cron 이 이미 관심종목 + 보유 종목 대상. 사용자는 크로스 티커도 관심종목에 등록하면 자연스럽게 커버. **spec 은 크로스 티커 자동 등록은 하지 않음** (사용자가 SPY/VIX 을 스스로 관심종목에 추가).

## AI 파서 프롬프트

- v3 섹션에 예시 추가 ("SPY -2% 이하 때만" / "VIX 25 초과 때 진입")
- 미지원 리스트에서 "크로스-티커" 제거

## 파일 변경

- `src/lib/custom-strategy/types.ts` — `cross_ticker` 타입, crossTicker/metric 필드, validateCondition 확장, conditionToString 지원
- `src/lib/custom-strategy/evaluator.ts` — `crossTickers` context 필드, `cross_ticker` case, `collectCrossTickers` pure
- `src/lib/custom-strategy/parser.ts` — 프롬프트 v3 확장
- `src/bot/notifications/custom-strategy-alert.ts` — crossTicker 수집 + PriceCache 확장 조회 + context 주입

## 테스트

- `types.test.ts` — cross_ticker 검증 (필수 필드, metric whitelist, 잘못된 operator)
- `evaluator.test.ts` — 데이터 없음 / 자기 참조 / price 비교 / change_percent 비교 / 여러 시나리오
- `custom-strategy-alert` 흐름 (option: e2e 하기 어려우면 pure `collectCrossTickers` 만 확실히 검증)

## 완료 조건

- [ ] lint / typecheck / test / build 통과
- [ ] self-review P0/P1/P2 = 0
- [ ] verify: 실제 running 서버에서 SPY 크로스 조건 전략 → 만족 시 발동

## 제외 (후속)

- 크로스 티커의 TA 지표 (RSI/MACD 등) — 조건 스키마 확장 필요
- 여러 크로스 티커 AND 조건 (예: SPY 하락 AND VIX 급등) — 현재 스키마에서도 `cross_ticker` 조건 2개로 표현 가능 (자연스러움)
- 크로스 티커 자동 관심종목 등록
