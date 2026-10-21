# [Phase 2] 실시간 주가 + 대시보드 업그레이드

## 목적

yahoo-finance2로 실시간 주가/환율을 가져와 PriceCache에 저장하고, 대시보드에 평가금·수익률·환차손익을 표시한다.

## 요구사항

### Backend — 주가 엔진

- [ ] yahoo-finance2 설치 + `src/lib/price-fetcher.ts` 구현
- [ ] Holding 테이블에서 고유 ticker 목록 + `USDKRW=X` 환율을 일괄 조회
- [ ] PriceCache 테이블에 upsert (ticker 기준)
- [ ] API 엔드포인트:
  - `GET /api/prices` — PriceCache 전체 반환 + 마지막 갱신 시각
  - `POST /api/prices/refresh` — 수동 갱신 트리거, 갱신된 가격 반환
- [ ] node-cron 스케줄러 (`src/lib/cron.ts` + `src/instrumentation.ts`):
  - 한국 장중 (09:00~15:30 KST, 평일): 10분마다
  - 미국 장중 (23:30~06:00 KST, 평일→익일): 10분마다
  - 장외: 1시간마다 (정각)
- [ ] 에러 핸들링: 개별 ticker 실패 시 나머지는 정상 upsert, 에러 로깅

### Frontend — 대시보드 업그레이드

- [ ] 대시보드 메인 (`/`):
  - FamilyTotalCard: 총 **평가금** 표시 (매입금 대비 수익률)
  - AccountSummaryCard: **평가금**, **수익률(%)**, 일일 변동
- [ ] 계좌 상세 (`/accounts/[id]`):
  - Stats 카드: 총 평가금 (vs 매입금), 수익률, 일일 손익
  - HoldingsTable 컬럼 추가: 현재가, 평가금, 수익률(%)
  - USD 종목: **환차손익 분리** (주가분 / 환율분)
- [ ] 주가 갱신 상태 표시 (마지막 갱신 시각, 헤더 영역)
- [ ] 수동 새로고침 버튼
- [ ] Phase 1 "매입 데이터 기준" 뱃지 제거

## 기술 설계

### yahoo-finance2 사용

```typescript
import yahooFinance from 'yahoo-finance2'

// quote()로 여러 종목 한 번에 조회
const results = await yahooFinance.quote(['AAPL', 'MSFT', '360750.KS', 'USDKRW=X'])
// 반환: { symbol, regularMarketPrice, regularMarketChange, regularMarketChangePercent, currency, ... }
```

### price-fetcher.ts 핵심 로직

```typescript
export async function refreshPrices(): Promise<PriceCacheResult> {
  // 1. DB에서 보유 종목 ticker 목록 조회
  const holdings = await prisma.holding.findMany({
    select: { ticker: true, displayName: true, market: true, currency: true },
    distinct: ['ticker'],
  })
  const tickers = [...holdings.map(h => h.ticker), 'USDKRW=X']

  // 2. yahoo-finance2로 일괄 조회
  const quotes = await Promise.allSettled(
    tickers.map(t => yahooFinance.quote(t))
  )

  // 3. 성공한 항목만 PriceCache에 upsert
  for (const [i, result] of quotes.entries()) {
    if (result.status === 'fulfilled') {
      await prisma.priceCache.upsert({
        where: { ticker: tickers[i] },
        update: { price, change, changePercent },
        create: { ticker, displayName, market, price, currency, change, changePercent },
      })
    }
  }
}
```

### Cron 스케줄 (instrumentation.ts)

```typescript
// src/instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { schedulePriceUpdates } = await import('./lib/cron')
    schedulePriceUpdates()
  }
}
```

```typescript
// src/lib/cron.ts — 매 10분 실행, 핸들러에서 장중/장외 판단
cron.schedule('*/10 * * * *', async () => {
  const isMarketHours = isKRMarketOpen() || isUSMarketOpen()
  if (isMarketHours || isTopOfHour()) {
    await refreshPrices()
  }
}, { timezone: 'Asia/Seoul' })
```

### 환차손익 분리 계산

USD 종목에만 적용:

```typescript
// 총 손익 (KRW)
totalPL = (currentPrice × currentFxRate - avgPriceFx × avgFxRate) × shares

// 주가 변동분: 주가 변동을 매수 환율로 환산
pricePL = (currentPrice - avgPriceFx) × avgFxRate × shares

// 환율 변동분: 나머지 (= 총손익 - 주가분)
fxPL = totalPL - pricePL
// = avgPriceFx × (currentFxRate - avgFxRate) × shares + 교차항
```

KRW 종목:
```typescript
totalPL = (currentPrice - avgPrice) × shares
// 환율 영향 없음
```

### 포맷 함수 추가 (format.ts)

```typescript
// 수익률: "+12.3%" (green) / "-5.2%" (red)
export function formatPercent(value: number): string

// 평가금 계산 (현재가 기준)
export function calcCurrentValueKRW(holding, currentPrice, currentFxRate): number

// 손익 계산 (매입금 vs 평가금)
export function calcProfitLoss(holding, currentPrice, currentFxRate): {
  totalPL: number       // 총 손익 (KRW)
  pricePL: number       // 주가 변동분 (KRW)
  fxPL: number          // 환율 변동분 (KRW, USD 종목만)
  returnPct: number     // 수익률 (%)
}
```

### 데이터 흐름

```
                        Cron (10분/1시간)
                              ↓
yahoo-finance2 → refreshPrices() → PriceCache (upsert)
                                        ↓
Server Component (page.tsx) → Prisma query (Holdings + PriceCache)
                                        ↓
                              calcProfitLoss() → UI 렌더링
```

Dashboard/Account 페이지는 서버 컴포넌트에서 PriceCache를 함께 조회:

```typescript
const prices = await prisma.priceCache.findMany()
const priceMap = new Map(prices.map(p => [p.ticker, p]))
const fxRate = priceMap.get('USDKRW=X')?.price ?? DEFAULT_FX_RATE_USD_KRW
```

## 테스트 계획

- [ ] `npm run build` 성공
- [ ] yahoo-finance2 quote 정상 호출 (개발환경에서 실제 API)
- [ ] PriceCache upsert 동작 (Prisma Studio에서 확인)
- [ ] `POST /api/prices/refresh` → PriceCache 업데이트
- [ ] `GET /api/prices` → 캐시된 가격 + updatedAt 반환
- [ ] 대시보드: 평가금, 수익률 표시 (vs 기존 매입금)
- [ ] 계좌 상세: HoldingsTable에 현재가, 평가금, 수익률 컬럼
- [ ] USD 종목: 환차손익 분리 (주가분 / 환율분) 표시
- [ ] 수동 새로고침 버튼 → 가격 갱신 → UI 반영
- [ ] 마지막 갱신 시각 표시
- [ ] cron 스케줄러: 서버 시작 시 `[cron] 주가 스케줄러 등록` 로그
- [ ] yahoo-finance2 실패 시: 에러 로깅 + 기존 캐시 유지 (UI 깨지지 않음)
- [ ] PriceCache 비어있을 때: 매입 데이터 기준으로 fallback 표시

## 제외 사항

- PortfolioSnapshot 자동 저장 (Phase 5)
- 장 휴일/서머타임 자동 처리 (Phase 11)
- 급등락 알림 (Phase 10)
- 양도소득세 계산 (Phase 4)
