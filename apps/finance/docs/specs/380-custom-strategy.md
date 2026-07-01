# [Phase 29-E v1] 커스텀 전략 스킬 업로드

- **작성일**: 2026-07-01
- **타입**: feature (P2)
- **참조**: 이슈 #230 (5), 마스터 #370

## 1. 배경

사용자가 자연어로 매매 전략을 정의하면 시스템이 자동 감시 → 조건 충족 시 텔레그램 알림. 이슈 #230 예시:

> "SOXL $40 이 되었을때 알림"

기존 관심종목 `targetBuy`/`entryLow`/`entryHigh` 는 단순 가격 조건만. **여러 조건 조합** (예: `SOXL <= 40 AND RSI <= 30`) 은 불가.

## 2. 설계 방향: B (구조화된 조건 + AI 파싱)

- 사용자: 자연어 입력 (봇 또는 웹)
- **AI 가 한 번만** 자연어 → 구조화된 조건 (JSON) 파싱
- cron 은 순수 코드로 조건 평가 (매 호출마다 AI 안 씀)
- 저비용 + 정확성 + 확장 가능

## 3. 데이터 모델

```prisma
model CustomStrategy {
  id              String   @id @default(cuid())
  name            String   // "SOXL 저점 매수"
  description     String?  // 자연어 원문 (사용자 표현 보존)
  ticker          String   // "SOXL"
  conditions      Json     // Condition[] — { type, operator, value, timeframe? }
  logic           String   @default("AND")  // "AND" | "OR"
  frequency       String   @default("daily") // "once" | "daily" | "always"
  isActive        Boolean  @default(true)
  lastTriggeredAt DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([ticker, isActive])
}
```

### Condition JSON 스펙
```ts
interface Condition {
  type: 'price' | 'rsi' | 'macd_signal' | 'sma_cross' | 'bb_position' | 'change_pct'
  operator: '<' | '<=' | '>' | '>=' | '==' | 'is'
  value: number | string  // price: 40, rsi: 30, macd_signal: 'GOLDEN', bb_position: 'BELOW_LOWER'
  timeframe?: '1d' | '5d' | '30d'  // change_pct 용
}
```

지원 조건 타입:
| type | 예시 | 코드 평가 |
|---|---|---|
| price | `price <= 40` | priceCache.price |
| rsi | `rsi <= 30` | TAReport.indicators.rsi14.value |
| macd_signal | `macd_signal is GOLDEN` | TAReport.indicators.macd.crossover |
| sma_cross | `sma_cross is GOLDEN` | TAReport.indicators.sma.goldenCross |
| bb_position | `bb_position is BELOW_LOWER` | TAReport.indicators.bollingerBands.position |
| change_pct | `change_pct(1d) <= -5` | priceCache.changePercent |

## 4. 프로세스 흐름

### 4.1 등록 (AI 파싱)
```
사용자 (봇/AI): "SOXL 이 40달러 이하 + RSI 30 이하 시 매수 알림"
                    ↓
AI (MCP: create_custom_strategy_from_text)
  → OpenAI/Claude 로 자연어 → JSON 파싱
  → 검증 + 저장
                    ↓
결과 확인 메시지 (조건 조합 요약)
```

### 4.2 감시 (cron, 매 10분)
```
매 price refresh 후 → evaluate_custom_strategies()
  → active 전략 순회
  → 각 조건 평가 (priceCache + generateTAReport 필요 시)
  → logic (AND/OR) 결합
  → 만족 && !dedup → 텔레그램 알림 + lastTriggeredAt 갱신
```

### 4.3 dedup (frequency)
- `once`: 한 번 알림 후 `isActive=false` 자동 비활성
- `daily`: 하루 1회 (lastTriggeredAt KST 기준)
- `always`: 매 cron 마다 (테스트/디버그)

## 5. 요구사항

### 필수 (v1)
- [ ] Prisma 모델 + 마이그레이션
- [ ] `src/lib/custom-strategy/parser.ts` — 자연어 → Condition[] 파싱 (AI 호출)
- [ ] `src/lib/custom-strategy/evaluator.ts` — Condition 평가 + logic 결합
- [ ] MCP 도구 4개:
  - `create_custom_strategy(text)` — 자연어 파싱 후 저장
  - `list_custom_strategies()`
  - `update_custom_strategy(id, ...)` — isActive/frequency 등 부분 수정
  - `delete_custom_strategy(id)`
- [ ] 봇 명령: `/전략등록 <자연어>`, `/전략목록`, `/전략삭제 <id>`
- [ ] cron 통합: `checkCustomStrategies()` — price cron 후 호출 (기존 `price-alert.ts` 병렬)
- [ ] `AlertConfig.custom_strategy_alerts = 'on'/'off'` (기본 on)

### 제외 (v2)
- 웹 UI (`/strategies` 페이지)
- 고급 조건 (뉴스 조건, 시간 필터, 계좌 필터)
- action 확장 (v1 은 알림만)

## 6. 파싱 프롬프트 (초안)

```
사용자 입력을 아래 JSON schema 로 파싱해줘. 지원 조건 타입만 사용:

지원 타입:
- price, rsi, macd_signal (GOLDEN|DEAD), sma_cross (GOLDEN|DEAD),
  bb_position (BELOW_LOWER|ABOVE_UPPER|INSIDE), change_pct (timeframe 1d/5d/30d)

연산자: <, <=, >, >=, ==, is (문자열 값 전용)

출력:
{
  "name": "짧은 요약 (예: 'SOXL 저점 매수')",
  "ticker": "SOXL",
  "conditions": [
    { "type": "price", "operator": "<=", "value": 40 },
    { "type": "rsi", "operator": "<=", "value": 30 }
  ],
  "logic": "AND",
  "frequency": "daily"
}

사용자 입력: {text}
```

## 7. 위험 / 완화

| 위험 | 완화 |
|---|---|
| AI 파싱 실패/잘못된 JSON | 검증 (schema), 파싱 실패 시 사용자에게 되묻기 |
| 조건 폭증 (한 사용자 100+ 전략) | v1 은 사용자당 max 50 (validation) |
| 지원 안 하는 조건 (예: 뉴스) | 파싱 시 명시적 거부 + 대안 안내 |
| cron 매 10분 실행 시간 폭증 | 조건 캐시 (priceCache + TAReport 재활용), 활성 전략만 순회 |
| dedup 이스케이프 | KST 날짜 기반, sentToday 로컬 map (price-alert 패턴 재사용) |

## 8. 테스트 계획

- 단위: parser 다양한 입력 케이스, evaluator 조건 조합 케이스
- 통합: cron 트리거 → 실제 알림 발송 (mock priceCache)
- 수동: 봇에서 `/전략등록 SOXL 40 이하 되면 알림` → 조건 만족 시나리오 시뮬레이션

## 9. 배포 후

- 텔레그램 `/reset` 필수 (MCP 도구 신규 추가)
- 등록 예시 안내: `/전략등록 카카오가 5만원 이하로 떨어지면 매수 알림`
- `/전략목록` 으로 등록된 전략 확인
