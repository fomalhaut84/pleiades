# [Phase 34-A] 커스텀 전략 v3 — 어닝 캘린더 조건

- **이슈**: #419
- **마스터**: #414
- **작성일**: 2026-07-08

## 목표

커스텀 전략 v2 조건에 **`earnings_within_days`** 추가. 어닝 임박 종목에 대한 진입 회피 (D-3 이내 skip) / 어닝 안전 지대 확인 (D+7 이상 진입) 자동화.

## 데이터 소스

`yahoo-finance2.quoteSummary(ticker, { modules: ['calendarEvents'] })` — 무료.
- 응답: `calendarEvents.earnings.earningsDate: Date[]` (다음 예정 어닝 배열, 보통 1~2개)
- 실패 시 (미국 외 일부 종목 지원 X) — 캐시 유지, false-safe.

## 스키마

### Prisma 신규 모델
```prisma
model EarningsCache {
  ticker             String    @id
  nextEarningsDate   DateTime?
  lastFetchedAt      DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
}
```

### Condition 확장
```ts
type ConditionType =
  ... // 기존
  | 'earnings_within_days'   // 다음 어닝까지 남은 일수
```
- operator: `<` / `<=` / `>` / `>=` / `==` (numeric)
- value: 정수 (일)
- timeframe: 미사용

**의미**: `earnings_within_days <= 3` = 다음 어닝까지 3일 이하 (오늘 = 0). 데이터 없거나 이미 지난 어닝만 있으면 조건 **false** (안전측 — 진입 회피 스타일 조건이라 매치 안 됨이 안전).

## 파일 변경

- `prisma/schema.prisma` + migration — `EarningsCache`
- `src/lib/earnings/fetcher.ts` (신규) — yahoo-finance2 호출, 단일 티커
- `src/lib/earnings/cache.ts` (신규) — upsert / getByTicker
- `src/lib/earnings/cron.ts` (신규 또는 `src/lib/cron.ts` 확장) — 일 1회 스캔, 대상 = 활성 전략 티커 ∪ 관심종목 ∪ 보유종목
- `src/lib/custom-strategy/types.ts` — `earnings_within_days` 추가 (NUMERIC_TYPES 확장)
- `src/lib/custom-strategy/evaluator.ts` — 조건 평가 (EarningsCache 조회 + 일수 계산)
- `src/lib/ai/system-prompt.ts` — AI 프롬프트에 예시 추가 (자연어 → 조건 변환용)
- `src/app/strategies/*` — 편집 폼 조건 옵션 추가

## Evaluator 로직

```ts
if (condition.type === 'earnings_within_days') {
  const cache = snapshot.earnings  // cron 이 미리 로드한 { nextEarningsDate }
  if (!cache?.nextEarningsDate) return false
  const days = Math.ceil((cache.nextEarningsDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
  if (days < 0) return false  // 이미 지난 어닝
  return numericCompare(days, condition.operator, condition.value)
}
```

## Cron

- 매일 KST 06:00 (미국 장 마감 후, 한국 장 시작 전)
- 대상 티커 수집:
  - `SELECT ticker FROM CustomStrategy WHERE isActive = true`
  - `SELECT ticker FROM Watchlist`
  - `SELECT DISTINCT ticker FROM Holding WHERE shares > 0`
- 병렬 fetch (concurrency 5)
- fetch 실패 → `lastFetchedAt` 만 업데이트, `nextEarningsDate` 유지
- 로그: `msg='earnings_scan'`, 성공/실패 카운트

## 테스트

- `validateCondition` — `earnings_within_days` 통과, 잘못된 value 거부
- `evaluator` — null cache / 과거 어닝 / 미래 D-0/D-3/D-30 시나리오
- `fetcher` — yahoo-finance2 mock 으로 성공/실패
- `cron` — 티커 수집 로직 (mock prisma)

## 완료 조건

- [ ] Prisma migration 적용
- [ ] lint / typecheck / test / build 통과
- [ ] self-review P0/P1/P2 = 0
- [ ] verify: 실제 티커 (예: AAPL) 로 fetcher → cache 반영 → evaluator 통과 확인

## 제외 (34-A 이후 후속 이슈)

- **Post-earnings drift** — 어닝 직후 진입 조건 (`days_since_earnings`) 별도 조건 타입 필요. 34-A 는 pre-earnings 만.
- **어닝 EPS 실적 조건** — surprise% 기반 조건
- **한국주 어닝** — Yahoo 는 미국 종목 위주. KRX 어닝은 별도 소스 필요.
