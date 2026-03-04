# Data Model

## Prisma Schema

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Account {
  id           String        @id @default(cuid())
  name         String                        // "세진", "소담", "다솜"
  ownerAge     Int?                           // 현재 나이
  strategy     String?                        // "growth", "balanced", "index-focus"
  horizon      Int?                           // 투자기간 (년)
  createdAt    DateTime      @default(now())
  holdings     Holding[]
  trades       Trade[]
  deposits     Deposit[]
  dividends    Dividend[]                     // Phase 3 배당금
  transactions Transaction[]                  // Phase 8 소비/수입
  snapshots    PortfolioSnapshot[]            // Phase 5 수익률 분석용 스냅샷
}

model Holding {
  id          String           @id @default(cuid())
  accountId   String
  account     Account          @relation(fields: [accountId], references: [id])
  ticker      String                         // "AAPL", "360750.KS"
  displayName String                         // "AAPL", "TIGER 미국S&P500"
  market      String                         // "US", "KR"
  shares      Int
  avgPrice    Float                          // 원화 기준 평균단가
  currency    String           @default("KRW")
  avgPriceFx  Float?                         // USD 평균단가 (미국주)
  avgFxRate   Float?                         // 매수 시점 가중평균 환율 (환차손익 분리용, Phase 2)
  strategy    HoldingStrategy?               // 종목별 전략 태그 (Phase 11)
  @@unique([accountId, ticker])
}

model Trade {
  id          String   @id @default(cuid())
  accountId   String
  account     Account  @relation(fields: [accountId], references: [id])
  ticker      String
  displayName String
  market      String
  type        String                         // "BUY", "SELL", "DIVIDEND"
  shares      Int
  price       Float                          // 체결가 (원본 통화)
  currency    String                         // "USD", "KRW"
  fxRate      Float?                         // 체결 시 환율
  totalKRW    Float                          // 원화 환산 총액
  note        String?
  tradedAt    DateTime
  createdAt   DateTime @default(now())
}

model Deposit {
  id          String   @id @default(cuid())
  accountId   String
  account     Account  @relation(fields: [accountId], references: [id])
  amount      Float                          // 입금액 (원)
  source      String                         // "gift", "allowance", "rsu"
  note        String?
  depositedAt DateTime
  createdAt   DateTime @default(now())
}

model PriceCache {
  ticker        String   @id
  displayName   String
  market        String
  price         Float
  currency      String
  change        Float?                         // 전일 대비 절대 변동
  changePercent Float?                         // 전일 대비 변동률 % (급락 알림에 사용)
  updatedAt     DateTime @updatedAt
}

model RSUSchedule {
  id          String   @id @default(cuid())
  vestingDate DateTime
  shares      Int?
  basisValue  Float
  basisDate   DateTime?
  basisPrice  Float?
  status      String   @default("pending")   // pending, vested, processed
  sellShares  Int?
  keepShares  Int?
  note        String?
}

// --- 2차 마일스톤 추가 ---

model Transaction {
  id          String   @id @default(cuid())
  accountId   String?              // null이면 가계(공통)
  account     Account? @relation(fields: [accountId], references: [id])
  type        String               // "income", "expense"
  categoryId  String?
  category    Category? @relation(fields: [categoryId], references: [id])
  amount      Float                // 금액 (원)
  description String?
  date        DateTime
  createdAt   DateTime @default(now())
  source      String   @default("manual") // "telegram", "manual"
}

model Category {
  id           String        @id @default(cuid())
  name         String        @unique            // "식비", "교통", "주거"
  type         String                           // "income", "expense"
  icon         String?                          // 이모지 "🍽", "🚗"
  budget       Float?                           // 월 예산 (원, 선택)
  keywords     String[]      @default([])       // 자동 분류 키워드 ["점심","저녁","커피"]
  transactions Transaction[]
}

model Briefing {
  id        String   @id @default(cuid())
  market    String               // "KR" | "US"
  type      String   @default("morning")  // "morning" | "manual" | "deep_analysis"
  date      DateTime
  content   String               // 마크다운 브리핑 전문
  metadata  Json?                // 사용된 종목, 검색 쿼리 등
  createdAt DateTime @default(now())

  @@unique([market, date, type])
}

model AlertConfig {
  id        String   @id @default(cuid())
  key       String   @unique               // "price_drop_pct", "fx_change_krw", "budget_pct"
  value     Float                           // -5, 50, 80 등
  label     String                          // "급락 알림 (%)", "환율 변동 (원)"
  updatedAt DateTime @updatedAt
}

model HoldingStrategy {
  id          String   @id @default(cuid())
  holdingId   String   @unique
  holding     Holding  @relation(fields: [holdingId], references: [id])
  strategy    String   @default("long_hold")  // long_hold, swing, momentum, value, watch, scalp
  memo        String?                          // "3만원 돌파 시 매수" 등
  targetPrice Float?                           // 목표가
  stopLoss    Float?                           // 손절가
  entryLow    Float?                           // 매수 구간 하한
  entryHigh   Float?                           // 매수 구간 상한
  reviewDate  DateTime?                        // 다음 점검일 (감시 전략용)
  updatedAt   DateTime @updatedAt
}

model Dividend {
  id          String   @id @default(cuid())
  accountId   String
  account     Account  @relation(fields: [accountId], references: [id])
  ticker      String
  displayName String
  exDate      DateTime?                        // 배당 기준일
  payDate     DateTime                         // 지급일
  amountGross Float                            // 세전 배당금 (원본 통화)
  amountNet   Float                            // 세후 배당금
  taxAmount   Float?                           // 원천징수 세금
  currency    String                           // "USD", "KRW"
  fxRate      Float?                           // 수령 시 환율
  amountKRW   Float                            // 원화 환산 세후 금액
  reinvested  Boolean  @default(false)         // 배당 재투자 여부
  createdAt   DateTime @default(now())
}

model Watchlist {
  id          String   @id @default(cuid())
  ticker      String   @unique
  displayName String
  market      String                           // "US", "KR"
  strategy    String   @default("swing")       // swing, momentum, value, scalp
  memo        String?                          // "RSI 30 이하 진입", "실적 발표 후 판단"
  targetBuy   Float?                           // 목표 매수가
  entryLow    Float?                           // 매수 구간 하한
  entryHigh   Float?                           // 매수 구간 상한
  alertEnabled Boolean @default(true)          // 알림 활성화
  addedAt     DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model PortfolioSnapshot {
  id          String   @id @default(cuid())
  accountId   String
  account     Account  @relation(fields: [accountId], references: [id])
  date        DateTime                         // 스냅샷 날짜
  totalValueKRW Float                          // 해당 시점 총 평가액 (원화)
  cashFlowKRW   Float  @default(0)             // 당일 입출금 합계 (TWR 계산용)
  fxRate      Float?                           // 해당 시점 USD/KRW 환율
  breakdown   Json?                            // 종목별 상세 (선택)
  createdAt   DateTime @default(now())

  @@unique([accountId, date])                  // 계좌별 날짜당 1개
}

// --- 3차 마일스톤 추가 (Phase 12~15) ---

model Asset {
  id           String    @id @default(cuid())
  name         String                          // "신한 적금", "전세 보증금"
  category     String                          // "savings", "insurance", "real_estate",
                                               // "pension", "loan", "cash", "other"
  owner        String                          // "세진", "공동", "소담"
  value        Float                           // 현재 평가액 (원)
  isLiability  Boolean   @default(false)       // true = 부채
  interestRate Float?                          // 이율
  maturityDate DateTime?                       // 만기일
  note         String?
  updatedAt    DateTime  @updatedAt
  createdAt    DateTime  @default(now())
}

model NetWorthSnapshot {
  id            String   @id @default(cuid())
  date          DateTime @unique               // 스냅샷 날짜 (매월 1일)
  stockValueKRW Float                          // 주식 총 평가액
  assetValueKRW Float                          // 비주식 자산 총액
  liabilityKRW  Float                          // 부채 총액
  netWorthKRW   Float                          // 순자산
  breakdown     Json                           // 카테고리별 상세
  createdAt     DateTime @default(now())
}

model QuarterlyReport {
  id        String   @id @default(cuid())
  quarter   String   @unique                   // "2026Q1"
  pdfPath   String                             // 파일 경로
  summary   String?                            // AI 요약 (미리보기용)
  metadata  Json?                              // 포함된 데이터 범위 등
  createdAt DateTime @default(now())
}
```

## Relationships

```
Account 1──N Holding             (계좌별 보유종목)
Account 1──N Trade               (계좌별 거래내역)
Account 1──N Deposit             (계좌별 입금/증여)
Account 1──N Dividend            (계좌별 배당 수령, Phase 3)
Account 1──N Transaction         (계좌별 소비/수입, Phase 8)
Account 1──N PortfolioSnapshot   (계좌별 일별 스냅샷, Phase 5 TWR)
Category 1──N Transaction        (카테고리별 소비/수입, Phase 8)
Holding 1──1 HoldingStrategy     (종목별 전략 태그, Phase 11)
Watchlist                        (독립, 관심종목, Phase 11)
PriceCache                       (독립, ticker 기준 JOIN)
RSUSchedule                      (독립, 세진 전용)
Briefing                         (독립, 모닝 브리핑, Phase 11)
AlertConfig                      (독립, 알림 임계값 설정, Phase 10)
Asset                            (독립, 비주식 자산, Phase 12)
NetWorthSnapshot                 (독립, 월별 순자산 스냅샷, Phase 12)
QuarterlyReport                  (독립, 분기 리포트, Phase 13)
```

## Ticker → displayName 매핑

코드 내 constants.ts에 관리:

```typescript
export const TICKER_MAP: Record<string, { displayName: string; market: string; currency: string; active?: boolean }> = {
  'AAPL':       { displayName: 'AAPL',                  market: 'US', currency: 'USD' },
  'MSFT':       { displayName: 'MSFT',                  market: 'US', currency: 'USD' },
  'NVDA':       { displayName: 'NVDA',                  market: 'US', currency: 'USD' },
  'RKLB':       { displayName: 'RKLB',                  market: 'US', currency: 'USD' },
  'XAR':        { displayName: 'XAR',                   market: 'US', currency: 'USD' },
  'SOXL':       { displayName: 'SOXL',                  market: 'US', currency: 'USD', active: false },  // 매도 완료
  '360750.KS':  { displayName: 'TIGER 미국S&P500',       market: 'KR', currency: 'KRW' },
  '446720.KS':  { displayName: 'SOL 미국배당다우존스',     market: 'KR', currency: 'KRW' },
  '472150.KS':  { displayName: 'SOL 미국배당미국채혼합50', market: 'KR', currency: 'KRW' },
  '035720.KS':  { displayName: '카카오',                  market: 'KR', currency: 'KRW' },
  '454910.KS':  { displayName: '두산로보틱스',             market: 'KR', currency: 'KRW' },
  '241560.KQ':  { displayName: '컨텍',                    market: 'KR', currency: 'KRW' },
};
```