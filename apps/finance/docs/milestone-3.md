# myFinance — 3차 마일스톤 계획

> 1차 마일스톤: 웹 대시보드 (Phase 1~6) — **"보는 도구"**
> 2차 마일스톤: 텔레그램 봇 + AI 어드바이저 (Phase 7~11) — **"대화하는 도구"**
> 3차 마일스톤: 자산 통합 + 교육 + 전략 고도화 (Phase 12~15) — **"성장하는 도구"**

---

## 전체 위치

```
1차 (Foundation)          2차 (Intelligence)        3차 (Growth)
──────────────           ──────────────           ──────────────
웹 대시보드               텔레그램 봇               순자산 통합
실시간 시세               AI 어드바이저             분기 리포트 PDF
거래 관리                 소비/수입 관리             백테스팅 엔진
세금 센터                 모닝 브리핑               아이들 교육 뷰
시뮬레이터                전략 맞춤 조언
```

### 선행 조건

3차 마일스톤은 2차 마일스톤이 안정적으로 운용되고 있는 상태에서 시작.
특히 Phase 9(AI 어드바이저), Phase 11(TA 엔진 + 전략 태그)이 핵심 의존성.

---

## Phase 12: 순자산 대시보드 (Net Worth Tracker)

### 목표

주식 포트폴리오만이 아니라, 가족 전체 자산(예적금, 보험, 부동산, 연금, 대출)을
한 화면에서 보고 월별 성장을 추적한다.

### 왜 필요한가

지금은 "주식 얼마, 수익률 몇 %" 만 보이는데,
실제 재무 건전성은 주식 비중이 전체 자산의 몇 %인지,
부채 대비 자산 비율은 어떤지에 달려 있다.
또한 월별 순자산 변화를 기록하면
"이번 달은 주식은 빠졌지만 적금이 채워서 순자산은 늘었다" 같은
전체 그림을 볼 수 있다.

### DB 스키마

```prisma
model Asset {
  id          String   @id @default(cuid())
  name        String                         // "신한 적금", "전세 보증금", "국민연금"
  category    String                         // "savings", "insurance", "real_estate",
                                             // "pension", "loan", "cash", "other"
  owner       String                         // "세진", "공동", "소담" 등
  value       Float                          // 현재 평가액 (원)
  isLiability Boolean  @default(false)       // true면 부채 (대출 등)
  interestRate Float?                        // 이율 (적금, 대출)
  maturityDate DateTime?                     // 만기일
  note        String?
  updatedAt   DateTime @updatedAt
  createdAt   DateTime @default(now())
}

model NetWorthSnapshot {
  id            String   @id @default(cuid())
  date          DateTime                     // 스냅샷 날짜 (매월 1일)
  stockValueKRW Float                        // 주식 포트폴리오 총 평가액
  assetValueKRW Float                        // 비주식 자산 총액
  liabilityKRW  Float                        // 부채 총액
  netWorthKRW   Float                        // 순자산 = 주식 + 자산 - 부채
  breakdown     Json                         // 카테고리별 상세
  createdAt     DateTime @default(now())

  @@unique([date])                           // 날짜당 1개
}
```

### 주요 기능

**웹 대시보드:**
```
┌─────────────────────────────────────────────┐
│ 💰 가족 순자산: ₩XXX,XXX,XXX               │
│                                             │
│ ┌──────────┐  주식 포트폴리오  ₩XX,XXX,XXX  │
│ │  파이차트  │  예적금          ₩XX,XXX,XXX  │
│ │  (카테고리 │  부동산(전세)     ₩XX,XXX,XXX  │
│ │   비중)   │  보험            ₩X,XXX,XXX   │
│ └──────────┘  연금            ₩X,XXX,XXX   │
│               대출           -₩XX,XXX,XXX  │
│                                             │
│ ────── 순자산 추이 (12개월) ──────           │
│ 📈 [라인차트: 월별 순자산, 구성요소 스택]    │
│                                             │
│ 전월 대비: +₩X,XXX,XXX (+2.3%)             │
│ 전년 대비: +₩XX,XXX,XXX (+15.7%)           │
└─────────────────────────────────────────────┘
```

**순자산 스냅샷 자동화:**
- 매월 1일 자동 스냅샷 (cron)
- 주식은 PriceCache에서 실시간 계산
- 비주식 자산은 마지막 수동 업데이트 값 사용
- 적금은 이율 기반으로 현재가 자동 추정 가능

**텔레그램 커맨드:**
```
/순자산                  → 현재 순자산 요약
/순자산 추이             → 최근 6개월 변화
/자산 추가 "신한적금" 적금 5000000   → 비주식 자산 등록
/자산 수정 "신한적금" 5200000        → 금액 업데이트
/자산목록                → 전체 자산/부채 현황
```

### 예상 기간: 2주

---

## Phase 13: 분기 리포트 PDF 자동 생성

### 목표

분기마다 AI가 포트폴리오를 종합 분석하고,
전문적인 PDF 리포트를 자동 생성해서 텔레그램으로 발송한다.
증여세 신고 근거 자료로도 활용 가능.

### 리포트 구성

```
┌─────────────────────────────────────────┐
│ 📊 myFinance 분기 리포트                │
│    2026년 1분기 (1월~3월)               │
├─────────────────────────────────────────┤
│                                         │
│ 1. 포트폴리오 총괄                       │
│    • 총 자산: ₩XX,XXX,XXX (+8.2%)      │
│    • 벤치마크 대비: S&P500 +5.1%,       │
│      내 포트폴리오 +8.2% → 초과 +3.1%   │
│    • [자산배분 파이차트]                  │
│                                         │
│ 2. 계좌별 성과                           │
│    ┌────────┬──────┬──────┬──────┐     │
│    │ 계좌   │ 수익률│ 벤치마크│ 초과  │     │
│    ├────────┼──────┼──────┼──────┤     │
│    │ 세진   │ +9.5%│ +5.1% │ +4.4%│     │
│    │ 소담   │ +6.8%│ +4.2% │ +2.6%│     │
│    │ 다솜   │+11.2%│ +7.3% │ +3.9%│     │
│    └────────┴──────┴──────┴──────┘     │
│    [계좌별 수익률 바차트]                 │
│                                         │
│ 3. 종목별 상세                           │
│    • 최고 기여: RKLB (+58%)             │
│    • 최저 기여: 컨텍 (-12%)             │
│    • [종목별 수익률 히트맵]               │
│                                         │
│ 4. 환차손익 분석                         │
│    • USD/KRW 분기 변동: 1,380 → 1,410  │
│    • 환율 효과: +₩XXX,XXX              │
│    • [주가분 vs 환율분 분리 차트]         │
│                                         │
│ 5. 배당 수익                             │
│    • 분기 배당 총액: ₩XXX,XXX           │
│    • 연환산 배당수익률: X.X%             │
│    • [월별 배당 수령 바차트]              │
│                                         │
│ 6. 세금 현황                             │
│    • 증여세: 소담 37% / 다솜 14% 사용    │
│    • 양도소득세 예상: ₩X,XXX,XXX        │
│    • RSU 일정: 4/9 베스팅 예정           │
│                                         │
│ 7. AI 종합 코멘트                        │
│    Claude가 분기 성과를 분석하고          │
│    다음 분기 전략 제안을 서술             │
│                                         │
│ 8. 부록: 증여 내역 (신고용)              │
│    소담 입금 이력 + 누적액 + 한도 잔여    │
│    다솜 입금 이력 + 누적액 + 한도 잔여    │
│                                         │
│ ────────────────────────────────────── │
│ 생성일: 2026.04.01 | myFinance v2.x    │
└─────────────────────────────────────────┘
```

### 기술 구현

```typescript
// src/lib/report-generator.ts

async function generateQuarterlyReport(quarter: string): Promise<Buffer> {
  // 1단계: 데이터 수집
  const performance = await calculatePerformance(quarter);  // Phase 5 수익률 엔진
  const dividends = await getDividendSummary(quarter);       // Phase 3 배당 추적
  const fxAnalysis = await getFxImpactAnalysis(quarter);     // Phase 2 환차손익
  const taxStatus = await getTaxSummary();                   // Phase 4 세금 센터
  const giftHistory = await getGiftHistory();                // 증여 내역

  // 2단계: AI 분석 코멘트
  const aiComment = await execClaude(buildReportPrompt({
    performance, dividends, fxAnalysis, taxStatus
  }), { model: 'sonnet' });

  // 3단계: PDF 생성
  //   방법 A: React 컴포넌트 → puppeteer로 HTML→PDF
  //   방법 B: react-pdf 라이브러리 (서버사이드 렌더링)
  const html = renderReportHTML({ performance, dividends, fxAnalysis,
                                   taxStatus, giftHistory, aiComment });
  const pdf = await htmlToPDF(html);  // puppeteer.launch() → page.pdf()

  // 4단계: 저장 + 전송
  await saveReport(quarter, pdf);
  await sendTelegramDocument(pdf, `myFinance_${quarter}_Report.pdf`);

  return pdf;
}
```

**PDF 생성 기술:**
- puppeteer (Chromium headless) → HTML 렌더링 → PDF 변환
- Recharts로 차트 렌더링 → SVG → PDF 내 삽입
- 한글 폰트 (Noto Sans KR) 내장

**자동 스케줄:**
```
1월 1주: Q4 리포트 (10~12월)
4월 1주: Q1 리포트 (1~3월)
7월 1주: Q2 리포트 (4~6월)
10월 1주: Q3 리포트 (7~9월)
```

**텔레그램 커맨드:**
```
/리포트              → 최신 분기 리포트 PDF 발송
/리포트 2026Q1       → 특정 분기 리포트
/리포트 생성         → 현재까지 데이터로 즉시 리포트 생성
```

### 의존성

Phase 2(환차손익), Phase 3(배당), Phase 4(세금), Phase 5(수익률),
Phase 9(Claude AI), Phase 11(전략 태그) — 사실상 모든 Phase의 결산 리포트.

### 예상 기간: 2~3주

---

## Phase 14: 백테스팅 엔진

### 목표

Phase 11의 TA 엔진과 전략 태그를 확장하여,
과거 데이터로 전략을 검증하는 시뮬레이션을 제공한다.
"이 전략으로 지난 1년간 매매했으면 어땠을까?"

### 전략 룰 DSL

```typescript
// src/lib/backtest/strategy-rules.ts

interface StrategyRule {
  name: string;
  description: string;
  buyConditions: Condition[];     // AND 조합
  sellConditions: Condition[];    // AND 조합
  params: Record<string, number>; // 조정 가능한 파라미터
}

type Condition =
  | { type: 'rsi_below'; value: number }        // RSI < value → 매수
  | { type: 'rsi_above'; value: number }        // RSI > value → 매도
  | { type: 'macd_cross'; direction: 'golden' | 'dead' }
  | { type: 'price_above_sma'; period: number } // 가격 > SMA(period)
  | { type: 'price_below_sma'; period: number }
  | { type: 'bb_position'; zone: 'below_lower' | 'above_upper' }
  | { type: 'volume_surge'; ratio: number }     // 거래량 > 평균 × ratio

// 프리셋 전략 예시
const RSI_REVERSAL: StrategyRule = {
  name: 'RSI 반전 매매',
  description: 'RSI 과매도에서 매수, 과매수에서 매도',
  buyConditions: [{ type: 'rsi_below', value: 30 }],
  sellConditions: [{ type: 'rsi_above', value: 70 }],
  params: { rsiBuy: 30, rsiSell: 70 },
};

const GOLDEN_CROSS: StrategyRule = {
  name: '골든크로스 추세추종',
  description: 'SMA50이 SMA200 상향돌파 시 매수, 하향돌파 시 매도',
  buyConditions: [{ type: 'macd_cross', direction: 'golden' }],
  sellConditions: [{ type: 'macd_cross', direction: 'dead' }],
  params: { shortPeriod: 50, longPeriod: 200 },
};

const BB_BOUNCE: StrategyRule = {
  name: '볼린저밴드 반등',
  description: 'BB 하단 이탈 시 매수, BB 상단 도달 시 매도',
  buyConditions: [{ type: 'bb_position', zone: 'below_lower' }],
  sellConditions: [{ type: 'bb_position', zone: 'above_upper' }],
  params: { period: 20, stdDev: 2 },
};
```

### 백테스트 엔진

```typescript
// src/lib/backtest/engine.ts

interface BacktestConfig {
  ticker: string;
  strategy: StrategyRule;
  startDate: Date;
  endDate: Date;
  initialCapital: number;      // 초기 자본 (원 or 달러)
  positionSize: number;        // 투입 비율 (0.0~1.0)
  commission: number;          // 수수료율 (0.0025 = 0.25%)
}

interface BacktestResult {
  trades: BacktestTrade[];      // 매수/매도 내역
  metrics: {
    totalReturn: number;        // 총 수익률 %
    annualizedReturn: number;   // 연환산 수익률
    maxDrawdown: number;        // 최대 낙폭 %
    sharpeRatio: number;        // 샤프 비율
    winRate: number;            // 승률 %
    profitFactor: number;       // 총이익/총손실
    totalTrades: number;        // 총 거래 횟수
    avgHoldDays: number;        // 평균 보유 기간
  };
  benchmarkReturn: number;      // 같은 기간 바이앤홀드 수익률
  equityCurve: { date: Date; value: number }[];  // 자산 곡선
}

interface BacktestTrade {
  type: 'BUY' | 'SELL';
  date: Date;
  price: number;
  shares: number;
  reason: string;               // "RSI 28.3 < 30" 등
  pnl?: number;                 // 매도 시 손익
}

async function runBacktest(config: BacktestConfig): Promise<BacktestResult> {
  // 1. 히스토리 데이터 로드
  const historical = await yahooFinance.historical(config.ticker, {
    period1: config.startDate,
    period2: config.endDate,
    interval: '1d',
  });

  // 2. 일자별로 TA 지표 계산 + 전략 룰 평가
  let position: 'NONE' | 'LONG' = 'NONE';
  let capital = config.initialCapital;
  const trades: BacktestTrade[] = [];
  const equityCurve: { date: Date; value: number }[] = [];

  for (const day of historical) {
    const indicators = calculateIndicatorsUpTo(historical, day);
    const shouldBuy = position === 'NONE'
      && evaluateConditions(config.strategy.buyConditions, indicators);
    const shouldSell = position === 'LONG'
      && evaluateConditions(config.strategy.sellConditions, indicators);

    if (shouldBuy) { /* 매수 실행 */ }
    if (shouldSell) { /* 매도 실행 + PnL 계산 */ }

    equityCurve.push({ date: day.date, value: currentPortfolioValue });
  }

  // 3. 메트릭 계산
  return { trades, metrics: calculateMetrics(trades, equityCurve), ... };
}
```

### 웹 UI

```
┌─────────────────────────────────────────────────────┐
│ 🔬 백테스팅 — NVDA                                  │
│                                                     │
│ 전략: [RSI 반전 ▼]  기간: [1년 ▼]  자본: [₩1,000만] │
│ RSI 매수: [30]  RSI 매도: [70]  [▶ 실행]             │
│                                                     │
│ ━━━ 결과 ━━━                                        │
│ 총 수익률: +23.4%  (바이앤홀드: +18.2%)              │
│ 초과 수익: +5.2%                                    │
│ 최대 낙폭: -8.7%   승률: 67%   거래 12회            │
│ 샤프: 1.42   평균 보유: 18일                        │
│                                                     │
│ [━━━━━ 자산 곡선 차트 ━━━━━]                        │
│  ── 내 전략  ── 바이앤홀드                           │
│  🟢 매수 포인트  🔴 매도 포인트                      │
│                                                     │
│ ━━━ 거래 내역 ━━━                                   │
│ 03/15 매수 $128.30 (RSI 28.3)                       │
│ 03/28 매도 $141.20 (RSI 72.1) → +10.1%             │
│ ...                                                 │
└─────────────────────────────────────────────────────┘
```

### 텔레그램 커맨드

```
/백테스트 NVDA RSI반전 1년        → 빠른 백테스트 실행
/백테스트 NVDA 골든크로스 2년      → 다른 전략
/백테스트 비교 NVDA 1년           → 모든 프리셋 전략 비교
```

### AI 연동

백테스트 결과를 Claude에게 전달하면:
- "이 전략은 상승장에서 잘 작동하지만, 횡보장에서 잦은 손절이 발생합니다"
- "RSI 기준을 25/75로 조정하면 거래 횟수는 줄지만 승률이 올라갈 수 있습니다"

같은 전략 개선 제안을 받을 수 있다.

### 예상 기간: 3~4주

---

## Phase 15: 아이들 금융 교육 뷰

### 목표

소담(9세)과 다솜(5세)이 성장하면서 자연스럽게
자기 투자 계좌에 관심을 갖고 금융 개념을 배울 수 있는
나이별 맞춤 교육 인터페이스를 제공한다.

### 나이별 단계 설계

```
┌─────────────────────────────────────────────────┐
│ 🌱 Level 1: 씨앗 (5~8세) — 다솜 현재 단계       │
│                                                 │
│ • "다솜이의 저금통" 메타포                        │
│ • 총 금액만 큰 숫자로 표시 (원 단위)              │
│ • 성장 애니메이션 (식물이 자라는 모션)             │
│ • "1년 전보다 이만큼 자랐어!" 비교                │
│ • 회사 로고 + 한줄 설명 ("아이폰 만드는 회사")    │
│ • 터치/클릭 인터랙션 최소화                       │
├─────────────────────────────────────────────────┤
│ 🌿 Level 2: 새싹 (9~12세) — 소담 현재 단계       │
│                                                 │
│ • "소담이의 투자 일기"                            │
│ • 종목별 수익률 (%, 원) — "애플이 +20% 올랐어!"   │
│ • 간단한 파이차트 (내 돈이 어디에 있는지)          │
│ • 배당금 개념 ("회사가 고마워서 용돈 줬어")        │
│ • 복리 시각화 ("매달 2만원 넣으면 20살 때...")     │
│ • 퀴즈/게임 ("주식이 뭘까?", "배당이 뭘까?")     │
├─────────────────────────────────────────────────┤
│ 🌳 Level 3: 나무 (13~15세)                      │
│                                                 │
│ • 실제 수익률 그래프 (기간별)                     │
│ • 벤치마크 비교 ("시장 평균보다 잘했을까?")        │
│ • 환율 개념 도입 ("달러가 비싸지면 어떻게 될까?")  │
│ • 세금 기초 ("주식 팔면 세금을 내야 해")          │
│ • 용돈 투자 시뮬레이터 (가상 매매 연습)           │
├─────────────────────────────────────────────────┤
│ 🏔️ Level 4: 산 (16~18세)                        │
│                                                 │
│ • 풀 대시보드 접근 (성인 뷰와 동일)               │
│ • 자기 계좌 거래 제안 가능 (부모 승인 필요)        │
│ • TA 기초 (이동평균선이 뭔지)                     │
│ • 포트폴리오 이론 기초 (분산투자, 리스크)          │
│ • "내가 직접 종목을 골라볼까?" 연습 모드           │
└─────────────────────────────────────────────────┘
```

### "내 투자 이야기" 타임라인

아이가 태어나거나 계좌를 만든 시점부터 현재까지의 투자 여정:

```
┌─────────────────────────────────────────────┐
│ 📖 소담이의 투자 이야기                      │
│                                             │
│ 🎂 2024.06 — 투자 시작!                     │
│    "아빠가 소담이 이름으로 계좌를 만들었어"   │
│    첫 투자: 애플 3주 🍎                     │
│                                             │
│ 🌟 2024.09 — 배당금 첫 수령!                │
│    "SOL 배당 ETF에서 ₩3,200 받았어"        │
│    "회사들이 소담이에게 용돈을 줬어!"         │
│                                             │
│ 📈 2025.03 — 100만원 돌파!                  │
│    "소담이 계좌가 100만원이 넘었어!"         │
│    [성장 그래프: 0 → 100만]                 │
│                                             │
│ 🚀 2025.08 — XAR 추가!                     │
│    "우주와 비행기 관련 회사에 투자했어"       │
│                                             │
│ 🎉 2026.03 — 지금!                         │
│    총 가치: ₩X,XXX,XXX                     │
│    "처음보다 XX% 자랐어! 🌱→🌳"             │
│                                             │
│ 🔮 2036 — 소담이 19살 예측                  │
│    "이대로 가면 약 ₩XX,XXX,XXX이 될 거야!"  │
└─────────────────────────────────────────────┘
```

### 용돈 투자 시뮬레이터

실제 돈 없이 가상 매매를 연습하는 모드:

```typescript
// 가상 포트폴리오 (실제 시세 사용, 가상 잔고)
interface SimulatorAccount {
  id: string;
  childAccountId: string;      // 실제 계좌 연결
  virtualCash: number;         // 가상 잔고 (예: 100만원)
  virtualHoldings: SimHolding[];
  trades: SimTrade[];
}
```

- 실제 주가 데이터를 쓰되, 가상 잔고로 거래
- 실제 계좌와 성과 비교 ("아빠가 고른 것 vs 내가 고른 것")
- 일정 기간 후 AI가 리뷰 ("분산투자를 잘 했어!" 등)

### 접근 제어

```typescript
// src/lib/auth/child-access.ts

interface ChildAccessConfig {
  accountId: string;
  childAge: number;
  level: 1 | 2 | 3 | 4;
  features: {
    viewBalance: boolean;
    viewReturns: boolean;
    viewBenchmark: boolean;
    viewTaxInfo: boolean;
    viewTA: boolean;
    simulator: boolean;
    suggestTrades: boolean;    // Level 4만
  };
}

function getAccessLevel(age: number): ChildAccessConfig['level'] {
  if (age <= 8) return 1;
  if (age <= 12) return 2;
  if (age <= 15) return 3;
  return 4;
}
```

### 기술 구현

- 별도 URL 경로: `/kids/sodam`, `/kids/dasom`
- 비밀번호나 PIN 보호 (아이가 직접 접근 가능하되, 성인 뷰는 잠금)
- 모바일 최적화 (아이가 태블릿/폰으로 볼 가능성 높음)
- 밝고 따뜻한 색상 테마 (메인 대시보드와 별도)
- 애니메이션 활용 (Framer Motion)

### 예상 기간: 3~4주

---

## 마일스톤 요약

| Phase | 내용 | 예상 기간 | 핵심 의존성 |
|-------|------|----------|-----------|
| **12** | 순자산 대시보드 | 2주 | Phase 1(웹), 8(소비/수입) |
| **13** | 분기 리포트 PDF | 2~3주 | Phase 2~5 전체, 9(AI) |
| **14** | 백테스팅 엔진 | 3~4주 | Phase 11(TA 엔진, 전략 태그) |
| **15** | 아이들 금융 교육 뷰 | 3~4주 | Phase 1(웹), 3(배당), 5(시뮬) |

**총 예상: 10~13주 (3차 전체)**

### 추천 진행 순서

```
Phase 12 (순자산) ──→ Phase 13 (PDF 리포트)
                        ↑ 12의 데이터가 리포트에 포함
Phase 14 (백테스팅) ── 독립적, 11 완료 후 언제든
Phase 15 (교육 뷰) ── 독립적, 소담 관심 시기에 맞춰
```

Phase 12 → 13은 순서대로, Phase 14와 15는 독립적이라 병행 가능.

### 3차 완료 후 전체 시스템

```
입력                    분석/시각화              AI
─────                  ──────────             ────
텔레그램 봇      ←→    웹 대시보드      ←→    Claude Code CLI
  - 매매 기록            - 포트폴리오              - 포트 분석
  - 소비/수입            - 시뮬레이션              - 소비 조언
  - 빠른 조회            - 세금 센터               - RSU 가이드
  - AI 질문              - 소비 분석               - 분기 리뷰
  - 전략 설정            - TA 차트                 - 모닝 브리핑
  - 알림 수신            - 순자산 추이              - 전략 맞춤 조언
  - 모닝 브리핑          - 브리핑 히스토리           - 분기 PDF 리포트
  - 순자산 관리          - 분기 리포트              - 백테스트 분석
  - 백테스트             - 백테스팅 결과            - 교육 콘텐츠
                        - 아이들 교육 뷰

로컬 엔진: trading-signals (RSI, MACD, BB, SMA → 시그널 + 백테스트)
DB: PostgreSQL (포트폴리오 + 소비 + 순자산 + 브리핑 + 백테스트)
AI: Claude Code CLI (claude -p) + WebSearch — Max 플랜
MCP: myFinance 전용 서버 (DB 도구 + 백테스트 도구)
PDF: puppeteer + Recharts SVG
```
