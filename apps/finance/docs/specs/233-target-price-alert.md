# 목표가 도달 알림

## 목적

보유종목의 목표가, 관심종목의 목표 매수가/매수구간 도달 시 텔레그램으로 자동 알림.

## 요구사항

- [ ] 보유종목: HoldingStrategy.targetPrice 도달 시 알림
- [ ] 보유종목: HoldingStrategy.stopLoss 도달 시 알림
- [ ] 관심종목: Watchlist.targetBuy 도달 시 알림
- [ ] 관심종목: Watchlist.entryLow~entryHigh 매수구간 진입 시 알림
- [ ] 중복 방지: 동일 조건 당일 1회만 발송 (기존 sentToday 패턴)
- [ ] 기존 급등락/환율 알림과 함께 발송

## 기술 설계

### 변경 파일 (1개)

**`src/bot/notifications/price-alert.ts`** — `checkPriceAlerts`에 목표가 체크 추가

#### 보유종목 목표가/손절가 체크
- HoldingStrategy의 targetPrice, stopLoss 조회
- 현재가 >= targetPrice → 목표가 도달 알림
- 현재가 <= stopLoss → 손절가 도달 알림

#### 관심종목 매수가/매수구간 체크
- Watchlist의 targetBuy, entryLow, entryHigh 조회
- 현재가 <= targetBuy → 목표 매수가 도달 알림
- entryLow <= 현재가 <= entryHigh → 매수구간 진입 알림

## 테스트 계획

- [ ] 보유종목 현재가가 targetPrice 이상 → 알림 발송
- [ ] 관심종목 현재가가 targetBuy 이하 → 알림 발송
- [ ] 관심종목 현재가가 매수구간 내 → 알림 발송
- [ ] 동일 조건 재알림 방지 (당일 1회)
- [ ] lint + typecheck + build 통과

## 제외 사항

- 알림 설정 UI 변경 없음 (기존 필드 활용)
- 텔레그램 알림 설정 커맨드 변경 없음
