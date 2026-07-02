# Phase 31-A — 커스텀 전략 조건 확장 v2 (시간/보유 필터)

- **작성일**: 2026-07-02
- **참조**: [395-milestone-13-master.md](./395-milestone-13-master.md), [380-custom-strategy.md](./380-custom-strategy.md) (v1)
- **선행 이슈**: 없음 (기존 v1 인프라 위에 addition)

## 1. 목적

파워 유저 관점의 잘못된 시간대 발동 방지 + 보유 여부 기반 조건 추가.

## 2. 요구사항

### 신규 조건 타입

- [ ] `time_window`
  - `value`: `HH:MM~HH:MM` 문자열 (KST 기준)
  - `operator`: `is`
  - 의미: 현재 KST 시각이 범위 내이면 true
  - 자정 경계: `23:00~02:00` 같은 wraparound 지원

- [ ] `weekday`
  - `value`: 대문자 요일 코드 배열 (예: `["MON","TUE","WED","THU","FRI"]`)
  - `operator`: `is`
  - 의미: 현재 KST 요일이 배열에 포함되면 true
  - 유효값: `MON` / `TUE` / `WED` / `THU` / `FRI` / `SAT` / `SUN`

- [ ] `holding_status`
  - `value`: `HELD` / `NOT_HELD`
  - `operator`: `is`
  - 의미: strategy.ticker 를 Holdings 테이블에 보유 중이면 `HELD` 매칭
  - 데이터: `Holding.shares > 0` 기준

### Types 확장

`src/lib/custom-strategy/types.ts`:
```ts
export type ConditionType =
  | 'price' | 'rsi' | 'macd_signal' | 'sma_cross' | 'bb_position' | 'change_pct'
  | 'time_window' | 'weekday' | 'holding_status'  // v2 추가

export const ALLOWED_STRING_VALUES = {
  macd_signal: ['GOLDEN', 'DEAD'] as const,
  sma_cross: ['GOLDEN', 'DEAD'] as const,
  bb_position: ['BELOW_LOWER', 'ABOVE_UPPER'] as const,
  holding_status: ['HELD', 'NOT_HELD'] as const,  // 신규
} as const

export const VALID_WEEKDAYS = new Set(['MON','TUE','WED','THU','FRI','SAT','SUN'])
```

- validateCondition 에 3 신규 케이스 추가:
  - `time_window`: `HH:MM~HH:MM` regex 매칭
  - `weekday`: 배열 + 각 요소가 VALID_WEEKDAYS 에 속함
  - `holding_status`: ALLOWED_STRING_VALUES 참조

### Evaluator 확장

`src/lib/custom-strategy/evaluator.ts`:

```ts
export interface EvaluationContext {
  now: Date            // KST 로 변환된 시각 접근용
  holdings: Set<string> // 보유 티커 set (호출자가 조회 후 주입)
}

export function evaluateCondition(
  cond: Condition,
  snapshot: MarketSnapshot,
  context: EvaluationContext,
): boolean
```

**주의**: 기존 호출자 (custom-strategy-alert.ts) 는 context 를 준비해 넘겨야 함.
- Holdings 조회: `prisma.holding.findMany({ where: { shares: { gt: 0 } }, select: { ticker: true }})` 1회
- KST now: `new Date(Date.now() + 9*60*60*1000)` (기존 패턴 재활용)

`requiresTA` 는 v2 조건 타입 무시 (TA 필요 없음).

### Parser 프롬프트 갱신

`src/lib/custom-strategy/parser.ts` 프롬프트 헤더에 신규 타입 안내:

```
지원 조건 타입 (v2 추가):
- time_window ("HH:MM~HH:MM" KST, is 전용)
- weekday (요일 배열 ["MON","FRI"] 등, is 전용)
- holding_status ("HELD" | "NOT_HELD", is 전용)

## 사용 예 (v2)
- "SOXL 40달러 이하 + 미국장 시간에만 알림" →
  {"conditions": [
    {"type":"price","operator":"<=","value":40},
    {"type":"time_window","operator":"is","value":"22:30~05:00"}
  ]}
- "NVDA MACD 골든크로스 + 평일에만" →
  {"conditions": [
    {"type":"macd_signal","operator":"is","value":"GOLDEN"},
    {"type":"weekday","operator":"is","value":["MON","TUE","WED","THU","FRI"]}
  ]}
- "TSLA 볼밴 하단 + 보유 중일 때만" →
  {"conditions":[
    {"type":"bb_position","operator":"is","value":"BELOW_LOWER"},
    {"type":"holding_status","operator":"is","value":"HELD"}
  ]}
```

### 표시 (conditionToString 확장)

- `time_window is 22:30~05:00`
- `weekday is [MON,TUE,WED,THU,FRI]`
- `holding_status is HELD`

## 3. 파일 변경

- `src/lib/custom-strategy/types.ts` — 3 신규 타입 + validation
- `src/lib/custom-strategy/evaluator.ts` — EvaluationContext + 3 신규 케이스
- `src/lib/custom-strategy/parser.ts` — 프롬프트 예시 확장
- `src/bot/notifications/custom-strategy-alert.ts` — holdings 조회 + context 전달
- 유닛 테스트 (types / evaluator) 확장

## 4. 호환성

- 기존 저장된 조건 (v1) 은 그대로 유효 — 신규 타입 addition
- Migration 불필요 (JSON 저장이라 스키마 변경 없음)

## 5. 테스트 계획

- [ ] `validateCondition` — 3 신규 타입 각각 valid/invalid 케이스
- [ ] `evaluateCondition` — time_window (KST, wraparound), weekday (경계), holding_status (Set 매칭)
- [ ] 통합: 기존 v1 조건과 v2 조건 혼합 시 AND/OR 정상 동작
- [ ] Parser (통합, mock 없이): 예시 3개 파싱 성공 확인 (선택, AI 호출 비용)

## 6. 제외 (v3 후보)

- `earnings_calendar` — 어닝 발표일 근접 필터
- `news_mention` — 뉴스 언급 조건
- `cross_ticker` — 다른 티커 시세 조건 참조
- 신규 action (v1/v2 는 알림만)

## 7. 완료 시

커스텀 전략에 시간/요일/보유 필터 적용 가능 → 잘못된 시간대 알림 억제.
