# [Phase 29-B v1] 전략별 알림 gap fix — long_hold 매수 기회 + 관심종목 long_hold 지원

- **작성일**: 2026-07-01
- **타입**: enhancement (P2)
- **참조**: 마스터 이슈 #370, 이슈 #230 (2)

## 1. 배경

Phase 29-B/C 는 사실상 `ta-signal-alert.ts` 에서 이미 대부분 구현되어 있음 (전략별 시그널 규칙, AI 가이드 첨부 등).

**남은 gap 2개**:
1. `long_hold` 전략 시그널이 `STRONG_SELL` (매도) 만 있음 — 급락/저평가 시 "매수 기회" 알림 없음
2. 관심종목에 `long_hold` 전략 등록 불가
   - 봇: `STRATEGY_LABELS` / `STRATEGY_ALIASES` 에 없음
   - 웹: `validStrategies` 배열에 없음
   - `ta-signal-alert.ts:121` 관심종목 대상에 `long_hold` 제외

## 2. 변경

### 2.1 봇 `src/bot/commands/watchlist.ts`
- `STRATEGY_LABELS` 에 `long_hold: '💎 장기보유'` 추가
- `STRATEGY_ALIASES` 에 `'장기': 'long_hold'`, `'장기보유': 'long_hold'` 추가

### 2.2 웹 `src/app/api/watchlist/route.ts`
- `validStrategies` 배열에 `'long_hold'` 추가

### 2.3 `src/bot/notifications/ta-signal-alert.ts`
- line 121: 관심종목 `strategy: { in: [...] }` 에 `'long_hold'` 추가
- `checkSignals` 의 `long_hold` case 에 `STRONG_BUY` 시그널 추가:
  ```ts
  if (report.signalSummary.overall === 'STRONG_BUY') {
    signals.push({
      id: 'STRONG_BUY',
      message: `💰 종합 STRONG_BUY — ${report.signalSummary.reasons.slice(0, 2).join(', ')} — 추가 매수 기회`
    })
  }
  ```

## 3. 테스트

- `npm run lint && npx tsc --noEmit && npm run test:run && npm run build`
- 수동:
  - 봇 `관심 SOXL 장기보유` 명령 → long_hold 로 저장 확인
  - `holdingStrategy.strategy = 'long_hold'` 인 보유 종목 중 STRONG_BUY 상황이면 매수 기회 알림 도착

## 4. 제외

- 새 알림 트리거 규칙 (예: -5% 하락 시 매수 기회) — TA 시그널 프레임워크로 이미 커버됨 (STRONG_BUY = 지지선 근접 + RSI 과매도 등 종합 판단)
- Phase 29-D (능동 AI cron) — 별도 PR
