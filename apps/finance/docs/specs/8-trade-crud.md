# [Phase 3] 거래 기록 CRUD + Holding 자동 업데이트

## 목적

거래(매수/매도) 기록을 생성·조회·수정·삭제하고, 거래 발생 시 Holding(보유종목)을 자동으로 업데이트한다.
현재는 시드 데이터로만 Holding이 존재하며, 실제 거래를 기록하는 기능이 없다.

## 요구사항

### Backend API

- [ ] `POST /api/trades` — 거래 생성
  - Body: `{ accountId, ticker, displayName, market, type, shares, price, currency, fxRate?, note?, tradedAt }`
  - `type`: "BUY" 또는 "SELL"
  - `totalKRW` 자동 계산: KRW → `price × shares`, USD → `price × shares × fxRate`
  - Prisma transaction으로 Trade 생성 + Holding 업데이트 원자적 처리
  - 응답: 생성된 Trade + 업데이트된 Holding

- [ ] `GET /api/trades` — 거래 내역 조회
  - Query: `accountId?`, `ticker?`, `type?`, `from?`, `to?`, `limit?`(기본 50), `offset?`
  - `tradedAt` 내림차순 정렬
  - 총 건수(`total`) 포함

- [ ] `DELETE /api/trades/[id]` — 거래 삭제
  - 해당 거래를 삭제하고 Holding을 해당 계좌+종목의 남은 거래로부터 재계산
  - 남은 거래가 0건이면 Holding 삭제

- [ ] `PUT /api/trades/[id]` — 거래 수정
  - 수정 시 Holding을 해당 계좌+종목의 전체 거래로부터 재계산
  - 수정 가능 필드: shares, price, fxRate, note, tradedAt

### Holding 업데이트 로직

**매수 (BUY):**
```
KRW 종목:
  newShares = holding.shares + trade.shares
  newAvgPrice = (holding.shares × holding.avgPrice + trade.shares × trade.price) / newShares

USD 종목:
  newShares = holding.shares + trade.shares
  newAvgPriceFx = (holding.shares × holding.avgPriceFx + trade.shares × trade.price) / newShares
  newAvgFxRate = (holding.shares × holding.avgFxRate + trade.shares × trade.fxRate) / newShares
  newAvgPrice = Math.round(newAvgPriceFx × newAvgFxRate)
```

**매도 (SELL):**
```
newShares = holding.shares - trade.shares  (newShares < 0 → 에러)
avgPrice, avgPriceFx, avgFxRate 변동 없음 (이동평균법)
newShares === 0 → Holding 삭제
```

**재계산 (수정/삭제 시):**
- 해당 계좌+종목의 전체 Trade를 `tradedAt` 순 정렬
- 초기값 shares=0, avgPrice=0 에서 BUY/SELL 순차 적용
- 최종 결과로 Holding upsert (거래 없으면 삭제)

### Frontend UI

- [ ] 거래 입력 폼 (페이지: `/trades/new`)
  - 계좌 선택 (세진/소담/다솜)
  - 종목 선택: 기존 보유종목 드롭다운 + 직접 입력
  - 거래 유형 (BUY / SELL)
  - 수량, 가격, 환율(USD만), 거래일, 메모
  - SELL 시 보유수량 표시 + 초과 검증

- [ ] 거래 내역 리스트 (페이지: `/trades`)
  - 필터: 계좌, 종목, 거래 유형
  - 테이블: 날짜, 계좌, 종목, 유형, 수량, 단가, 총액, 메모
  - 삭제/수정 액션 버튼

- [ ] 사이드바에 "거래" 메뉴 추가

## 기술 설계

### Holding 재계산 유틸

`src/lib/trade-utils.ts`에 공통 로직 추출:
- `recalcHolding(trades: Trade[]): HoldingData` — Trade 배열 → Holding 상태 계산
- `applyBuy(holding, trade)` / `applySell(holding, trade)` — 단일 거래 적용

### Validation

- shares > 0 (정수)
- price > 0
- USD 종목: fxRate 필수, > 0
- SELL: 보유수량 ≥ 거래수량
- accountId, ticker 존재 확인
- tradedAt: 유효한 날짜

### 에러 처리

| 상황 | HTTP | 에러 메시지 |
|------|------|------------|
| 잘못된 입력 | 400 | 구체적 필드 에러 |
| 계좌 없음 | 404 | "계좌를 찾을 수 없습니다" |
| 매도 수량 초과 | 400 | "보유 수량(N주)을 초과합니다" |
| 거래 없음 (삭제/수정) | 404 | "거래를 찾을 수 없습니다" |

## 제외 사항 (별도 이슈)

- CSV 임포트
- 배당금(DIVIDEND) 거래 유형
- RSU 워크플로
- 기존 거래 데이터 일괄 시드

## 테스트 계획

- [ ] 매수 → Holding 생성/가중평균 검증
- [ ] 매도 → 수량 차감 + avgPrice 불변 검증
- [ ] 매도 수량 초과 → 400 에러
- [ ] 전량 매도 → Holding 삭제
- [ ] 거래 삭제 → Holding 재계산
- [ ] 거래 수정 → Holding 재계산
- [ ] USD 종목: avgPriceFx, avgFxRate 가중평균 검증
- [ ] 필터 조회 (계좌, 종목, 날짜)
