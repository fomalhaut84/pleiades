# Phase 25-C: Trade import 검증 강화

## 목적

Phase 25-A에서 import의 market 비교 정규화는 이미 적용됐다. 이번에는 거래 입력 검증에 남아 있는 두 가지 hardening을 추가한다:

1. **거래일 범위 검증**: 미래 날짜 또는 1900년 이전 날짜가 들어오면 holdings 재계산이 왜곡될 수 있음
2. **ticker 사전 정규화**: 현재 단일/import POST 모두 validation 통과 후에 trim/uppercase를 적용해 일관성 깨질 가능성

## 배경

- 25-A에서 `normalizeMarket` 통일로 SATL 등록 문제 해결됨
- import의 batch-level `['US','KR']` 검증은 이미 존재
- 그러나 trade 데이터 자체의 추가 검증은 미흡

### 거래일 검증 누락의 영향
- recalcHolding은 trades를 `tradedAt asc`로 정렬해 순차 처리
- 미래 trade가 들어오면 holdings 잔량/평단이 비현실적으로 계산됨
- 1900년 같은 명백한 오타도 그대로 받아들임

### ticker 정규화 순서
- 현재: `validateTradeInput(body)` → `ticker.toUpperCase().trim()` (단일 POST)
- 결과: displayName fallback이 trim 안 된 ticker를 사용 (`displayName || ticker`)
- 일관성: validation 안에서 정규화된 ticker로 모든 체크 수행해야 함

## 요구사항

- [ ] `validateTradeInput`에 tradedAt 범위 검증 추가
  - 미래(+1일 grace로 timezone 고려) 거부
  - 2000-01-01 이전 거부
- [ ] ticker 사전 정규화 (trim + uppercase)
  - validation 진입 직전 normalize
  - 단일 POST (`src/app/api/trades/route.ts`)
  - import POST (`src/app/api/trades/import/route.ts`)

## 기술 설계

### 1. tradedAt 범위 검증 (trade-utils.ts)

```ts
const MIN_DATE = Date.UTC(2000, 0, 1)
const MAX_FUTURE_DAYS = 1  // timezone (KST) edge case 허용

if (!body.tradedAt || isNaN(Date.parse(body.tradedAt))) {
  errors.push({ field: 'tradedAt', message: '유효한 거래일을 입력해주세요.' })
} else {
  const ts = Date.parse(body.tradedAt)
  const maxFuture = Date.now() + MAX_FUTURE_DAYS * 86_400_000
  if (ts > maxFuture) {
    errors.push({ field: 'tradedAt', message: '미래 날짜는 입력할 수 없습니다.' })
  } else if (ts < MIN_DATE) {
    errors.push({ field: 'tradedAt', message: '2000-01-01 이후 날짜를 입력해주세요.' })
  }
}
```

### 2. ticker 정규화 순서

```ts
// 변경 전 (api/trades/route.ts)
const errors = validateTradeInput(body)
// ...
const ticker = body.ticker.toUpperCase().trim()

// 변경 후
const normalizedTicker = (body.ticker ?? '').toString().trim().toUpperCase()
const errors = validateTradeInput({ ...body, ticker: normalizedTicker })
// ...
const ticker = normalizedTicker
```

Import도 동일 패턴: `t.ticker` 추출 직후 정규화.

## 테스트 계획

- [ ] `npm run lint`
- [ ] `npx tsc --noEmit`
- [ ] `npm run build`
- [ ] 수동 시나리오:
  - 단일 거래 POST에 tradedAt = 내일 → 400 error
  - 단일 거래 POST에 tradedAt = 1999-12-31 → 400 error
  - 단일 거래 POST에 ticker = ' aapl ' → 정상 저장(AAPL)
  - CSV import에 미래 거래일 → row error로 표시 + skip

## 제외 사항

- per-row market 지정 (현재는 batch-level) — 별도 feature
- displayName 자동 보강 (Yahoo lookup) — 별도 feature
- Zod 마이그레이션 — Phase 25-F

## 라벨

- `fix`, `P1`, `phase-25`
