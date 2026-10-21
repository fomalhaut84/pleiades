# 전략 기반 TA 시그널 알림

## 목적

스윙/모멘텀/단타 전략 종목에 대해 TA 조건 충족 시 자동 텔레그램 알림.
기존 시세 갱신 cron과 연동하여 장중 주기적으로 체크.

## 요구사항

- [ ] 전략별 TA 시그널 조건 정의 및 체크
- [ ] 시세 갱신 후 TA 시그널 체크 cron 실행
- [ ] 시그널 발생 시 텔레그램 알림 (종목, 시그널 종류, 현재 지표값)
- [ ] 중복 방지: 동일 시그널 당일 1회만 발송

## 기술 설계

### 전략별 시그널 조건

| 전략 | 조건 | 시그널 |
|------|------|--------|
| swing | RSI < 30 | 📉 과매도 (매수 기회) |
| swing | RSI > 70 | 📈 과매수 (매도 검토) |
| swing | MACD 골든크로스 | 🔄 매수 시그널 |
| swing | MACD 데드크로스 | 🔄 매도 시그널 |
| momentum | 거래량 급증(2배+) + 상승 | 🚀 모멘텀 시그널 |
| momentum | SMA 골든/데드크로스 | 🔄 추세 전환 |
| scalp | BB 하단 이탈 | 📉 매수 구간 |
| scalp | BB 상단 이탈 | 📈 매도 구간 |
| long_hold | overall STRONG_SELL | ⚠️ 장기보유 경고 |

### 변경 파일

1. **`src/bot/notifications/ta-signal-alert.ts`** (신규) — 전략별 TA 시그널 체크 + 알림
2. **`src/lib/cron.ts`** — 장중 TA 체크 cron 등록
3. **`src/bot/standalone.ts`** — cron 등록 호출

### 실행 주기

기존 시세 갱신(10분) 후 checkPriceAlerts와 함께 실행.
TA 계산은 yahoo-finance2 OHLCV 조회가 필요하므로 비용이 크다.
→ 스윙/모멘텀/단타 전략이 설정된 종목만 대상 (장기보유는 하루 1회).

## 테스트 계획

- [ ] 스윙 종목 RSI < 30 → 과매도 알림 발송
- [ ] 모멘텀 종목 거래량 급증 → 모멘텀 시그널 알림
- [ ] 동일 시그널 재알림 방지 (당일 1회)
- [ ] lint + typecheck + build 통과

## 제외 사항

- TA 엔진 로직 변경 없음 (기존 generateTAReport 사용)
- 알림 주기 설정 UI는 20-E에서 구현
