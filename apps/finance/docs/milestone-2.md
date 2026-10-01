# myFinance — 2차 마일스톤 계획

> 1차 마일스톤: 웹 대시보드 (Phase 1~6) — **"보는 도구"**
> 2차 마일스톤: 텔레그램 봇 + AI 어드바이저 — **"대화하는 도구"**

---

## 전체 구조

```
┌──────────────┐     ┌──────────────┐
│  텔레그램 앱  │     │  웹 대시보드   │
│  (입력/알림)  │     │  (시각화/분석) │
└──────┬───────┘     └──────┬───────┘
       │                    │
       ▼                    ▼
┌──────────────────────────────────────┐
│         myFinance API Layer          │
│      (Next.js API Routes — 공유)     │
├──────────────────────────────────────┤
│                                      │
│  ┌────────────┐   ┌───────────────┐  │
│  │ Telegram   │   │ Claude Code   │  │
│  │ Bot Server │   │ CLI (claude   │  │
│  │ (grammY)   │   │ -p, Max 플랜) │  │
│  └─────┬──────┘   └───────┬───────┘  │
│        │                  │          │
│        └────────┬─────────┘          │
│                 ▼                    │
│  ┌──────────────────────────────┐    │
│  │      PostgreSQL              │    │
│  │   + 소비/수입 테이블 확장    │    │
│  └──────────────────────────────┘    │
└──────────────────────────────────────┘
```

핵심 포인트: 1차에서 만든 DB와 API를 그대로 공유.
텔레그램은 "빠른 입력 + 알림 채널", 웹은 "분석 + 시각화" 역할 분담.
AI는 Claude API 대신 서버에 설치된 Claude Code CLI를 subprocess로 호출 (Max 플랜 포함).

---

## Phase 7: 텔레그램 봇 — 기본 구조

### 목표
텔레그램으로 주식 매매 기록, 잔고 조회를 할 수 있게 한다.

### 기술 선택

| 항목 | 선택 | 이유 |
|------|------|------|
| 봇 프레임워크 | grammY | TypeScript 네이티브, 활발한 유지보수, Telegraf 대비 현대적 |
| 실행 방식 | Webhook (Nginx 연동) | 서버에서 이미 Nginx 운영 중. 폴링 대비 효율적 |
| 인증 | Telegram Chat ID 화이트리스트 | 가족 전용. 등록된 ID만 허용 |

### 구현 범위

```
/start              → 봇 소개 + 인증
/현황                → 전체 포트폴리오 요약 (3계좌)
/계좌 [이름]         → 특정 계좌 상세 (세진/소담/다솜)
/매수 [계좌] [종목] [수량] [가격]  → 매수 기록
/매도 [계좌] [종목] [수량] [가격]  → 매도 기록
/환율                → 현재 USD/KRW 환율
/주가 [종목]         → 종목 현재가 조회
```

### 대화형 입력 (Conversation Flow)

커맨드 외에 자연스러운 대화형 입력도 지원:

```
사용자: "소담 계좌에서 TIGER S&P500 10주 24900원에 샀어"
  봇: 📝 매수 기록
      계좌: 소담
      종목: TIGER 미국S&P500 (360750.KS)
      수량: 10주
      가격: ₩24,900
      총액: ₩249,000
      [확인] [수정] [취소]
```

→ 자연어 파싱에 Claude API 활용 (Phase 9에서 통합).
  Phase 7에서는 커맨드 기반 + 인라인 키보드 방식 우선.

### 파일 구조 (추가분)

```
src/
├── bot/
│   ├── index.ts              # grammY 봇 인스턴스 + webhook
│   ├── middleware/
│   │   └── auth.ts           # Chat ID 화이트리스트
│   ├── commands/
│   │   ├── start.ts
│   │   ├── portfolio.ts      # /현황, /계좌
│   │   ├── trade.ts          # /매수, /매도
│   │   └── price.ts          # /주가, /환율
│   ├── keyboards/
│   │   └── confirm.ts        # 인라인 키보드 (확인/취소 등)
│   └── utils/
│       └── formatter.ts      # 텔레그램 메시지 포맷팅
```

---

## Phase 8: 소비/수입 관리 확장

### 목표
주식 외 일상 소비·수입도 텔레그램으로 기록하고 웹에서 분석.

### DB 스키마 확장

```prisma
model Transaction {
  id          String   @id @default(cuid())
  accountId   String?              // null이면 가계(공통)
  account     Account? @relation(fields: [accountId], references: [id])
  type        String               // "income", "expense"
  categoryId  String?
  category    Category? @relation(fields: [categoryId], references: [id])
  amount      Float                // 금액 (원)
  description String?              // 메모
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
```

### 텔레그램 인터페이스

```
사용자: "점심 12000"
  봇: 🍽 식비 ₩12,000 기록했어요.
      [수정] [삭제]

사용자: "월급 350만"
  봇: 💰 월급 ₩3,500,000 기록했어요.

/소비                → 이번 달 소비 요약
/소비 [카테고리]     → 카테고리별 상세
/수입                → 이번 달 수입 요약
/예산                → 카테고리별 예산 대비 현황
```

### 카테고리 자동 분류

짧은 메시지 → 규칙 기반 매칭 (Phase 8):
- "점심", "저녁", "커피" → 식비
- "택시", "버스", "주유" → 교통
- "월급", "보너스" → 수입

Phase 9에서 Claude로 자연어 분류 업그레이드.

### 웹 대시보드 확장

- 월별 소비/수입 차트
- 카테고리별 파이차트
- 예산 대비 지출 게이지
- 투자 + 소비 통합 자산 현황

---

## Phase 9: Claude AI 어드바이저

### 목표
포트폴리오 상황과 시장 데이터를 기반으로 인사이트와 조언을 제공.

### 아키텍처

```
텔레그램 질문 or 웹 "AI 분석" 버튼
            │
            ▼
    ┌───────────────────┐
    │ Claude Code CLI   │
    │ (claude -p)       │
    │ Max 플랜 포함     │
    │                   │
    │ System Prompt     │──→ 가족 투자 전략, 운영 원칙, 세금 규칙
    │                   │
    │ MCP Server:       │
    │  - get_portfolio(account)     → DB에서 보유종목 조회
    │  - get_prices()               → PriceCache 조회
    │  - get_trades(account, range) → 거래 내역 조회
    │  - get_gift_tax(account)      → 증여세 현황 조회
    │  - get_spending(range)        → 소비/수입 조회
    │  - search_market_news(query)  → 시장 뉴스 검색
    └───────┬───────────┘
            │
            ▼
    자연어 응답 (한국어)
```

Claude Code CLI를 subprocess로 호출하고, myFinance 전용 MCP 서버를 통해
DB 조회 도구를 제공한다. API의 Tool Use와 동일한 효과.

```typescript
// src/lib/claude-advisor.ts
import { execFile } from 'child_process';

export async function askAdvisor(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('claude', [
      '-p', prompt,
      '--output-format', 'json',
      '--model', 'sonnet',
      '--allowedTools', 'mcp__myfinance__*'
    ], {
      cwd: process.env.PROJECT_ROOT,
      timeout: 120_000,
    }, (err, stdout) => {
      if (err) reject(err);
      const result = JSON.parse(stdout);
      resolve(result.result);
    });
  });
}
```

### MCP 서버 설계 (myFinance 전용)

`.claude/config.toml`에 myFinance MCP 서버를 등록:

```toml
[mcp_servers.myfinance]
command = "node"
args = ["src/mcp/server.js"]
```

MCP 서버가 제공하는 도구들:

```typescript
// src/mcp/server.ts — MCP 서버 도구 정의
const tools = [
  // --- 포트폴리오 ---
  {
    name: "get_portfolio",
    description: "특정 계좌의 보유종목과 현재 가치를 조회한다 (환차손익 분리 포함)",
    parameters: {
      account_name: {
        type: "string",
        enum: ["세진", "소담", "다솜", "전체"],
      }
    }
  },
  {
    name: "get_trades",
    description: "특정 계좌의 거래 내역을 조회한다",
    parameters: {
      account_name: { type: "string" },
      days: { type: "number", description: "최근 N일" }
    }
  },
  {
    name: "get_performance",
    description: "계좌별 TWR 수익률과 벤치마크 대비 초과수익률",
    parameters: {
      account_name: { type: "string" },
      period: { type: "string", enum: ["1m", "3m", "6m", "1y", "all"] }
    }
  },
  // --- 배당 ---
  {
    name: "get_dividends",
    description: "배당 수령 내역과 연간 배당수익률",
    parameters: {
      account_name: { type: "string" },
      year: { type: "number", description: "조회 연도" }
    }
  },
  // --- 세금 ---
  {
    name: "get_gift_tax_status",
    description: "아이 계좌의 증여세 현황 (누적 증여액, 한도, 사용률)",
    parameters: {
      account_name: { type: "string", enum: ["소담", "다솜"] }
    }
  },
  // --- 소비 ---
  {
    name: "get_spending_summary",
    description: "기간별 소비/수입 요약",
    parameters: {
      period: { type: "string", enum: ["이번달", "지난달", "최근3개월"] }
    }
  },
  // --- 시뮬레이션 ---
  {
    name: "simulate_growth",
    description: "포트폴리오 미래 성장 시뮬레이션",
    parameters: {
      account_name: { type: "string" },
      years: { type: "number" },
      monthly_addition: { type: "number" },
      annual_return: { type: "number" }
    }
  },
  // --- 전략 + TA (Phase 11) ---
  {
    name: "get_holding_strategy",
    description: "종목의 전략 태그, 목표가, 손절가, 메모, 점검일 조회",
    parameters: {
      ticker: { type: "string" }
    }
  },
  {
    name: "get_technical_analysis",
    description: "종목의 TA 리포트 (RSI, MACD, BB, SMA, 지지저항, 시그널)",
    parameters: {
      ticker: { type: "string" }
    }
  },
  {
    name: "get_watchlist",
    description: "관심종목 목록 + 현재가 + TA 시그널 + 진입조건 충족 여부",
    parameters: {}
  }
];
```

각 도구는 Prisma를 통해 PostgreSQL을 직접 조회하고 결과를 반환.
TA 도구는 trading-signals 엔진을 호출하여 실시간 계산 후 반환.

### System Prompt 설계

```
당신은 myFinance의 가족 자산관리 AI 어드바이저입니다.

가족 구성: 세진(본인), 소담(9세), 다솜(5세)
운영 원칙:
1. 아이들 계좌 = 절대 매도 금지 (10~15년 장기)
2. 세진 = 인덱스 비중 확대 (RSU + 월 20만원)
3. 증여세 비과세 한도 관리 (미성년 10년 2,000만원)
4. 분기 1회 점검, 급하게 움직이지 않기

응답 규칙:
- 투자 권유가 아닌 정보 제공임을 명시
- 세금 관련은 "참고용, 세무사 확인 권장" 문구 포함
- 한국어로 간결하게 응답
- 텔레그램용이면 마크다운 포맷 사용
- 필요한 데이터는 도구를 호출해서 확인
```

### 사용 시나리오

**텔레그램:**
```
사용자: "다솜 계좌 지금 어때?"
  봇 → Claude: get_portfolio("다솜") + get_prices()
  Claude: 📊 다솜 계좌 현황
          총 평가액: ₩432만 (전일 대비 +1.2%)
          TIGER S&P500 36주: ₩89.6만 (+3.2%)
          XAR 2주: ₩82만 (+12.5%)
          ...
          15년 후 예상: 현 추세 유지 시 ~₩1,400만
          증여세 한도: 14% 사용 중, 여유 충분합니다.

사용자: "이번 달 너무 많이 쓴 것 같은데"
  봇 → Claude: get_spending_summary("이번달")
  Claude: 💸 3월 소비 현황
          총 지출: ₩186만 (지난달 대비 +23%)
          식비: ₩52만 (예산 ₩40만 초과 ⚠️)
          교통: ₩18만 (예산 내)
          ...
          식비가 예산을 12만원 초과했어요.
          외식 빈도를 줄이면 월 10만원 절약 가능합니다.

사용자: "4월에 RSU 나오면 어떻게 해야 해?"
  봇 → Claude: get_portfolio("세진") + RSU 전략 참조
  Claude: 🎯 RSU 실행 가이드
          4/9 베스팅: 카카오 135주 (예상 ~₩810만)
          계획: 70주 즉시 매도 → TIGER S&P500 ~170주 전환
          65주 장기 보유

          주의: 베스팅 직후 매도해야 양도세 최소화.
          근로소득세는 회사 원천징수, 연말정산 시 추가 납부 가능.
          정확한 세금은 세무사 확인을 권장합니다.
```

**웹 대시보드 (AI 분석 탭):**
```
[분기 리뷰 요청] 버튼 클릭
  → Claude가 전체 계좌 분석
  → 리밸런싱 제안, 증여세 현황, 목표 대비 진행도
  → 마크다운 리포트 생성 + 대시보드에 표시
```

### 비용 및 사용량 관리

- Claude Code CLI는 Max 플랜 사용량에 포함 (추가 비용 없음)
- 단, claude.ai + Claude Code + Claude Desktop 모두 같은 한도를 공유
- 모델 선택: Haiku (일상 질문) / Sonnet (분기 리뷰) — 한도 절약
- AI 호출 빈도 제한: 일일 상한 설정 (예: 30회/일)
- 자주 묻는 포트폴리오 현황은 DB 캐싱으로 AI 호출 최소화
- Agent SDK가 Max 빌링 지원 시 subprocess → SDK로 전환 검토

---

## Phase 10: 알림 + 자동화

### 목표
시장 변동, 일정 알림, 예산 경고를 텔레그램으로 자동 발송.

### 알림 종류

```
정기 알림 (cron):
  📈 매일 09:00  → 전일 포트폴리오 수익률 요약
  📅 매월 1일    → 월간 리포트 (투자 + 소비)
  📅 분기 1일    → 분기 리뷰 리마인더 (컨텍 점검 포함)
  🎯 RSU 베스팅 D-7, D-1 → 실행 가이드 리마인드

이벤트 알림 (임계값 조정 가능):
  🔴 종목 급락 → 즉시 알림 (기본 -5%, 매도 금지 원칙 리마인드)
  🟡 환율 변동 → 환율 알림 (기본 ±₩50)
  ⚠️ 소비 예산 도달 → 예산 경고 (기본 80%)
  💰 증여 한도 도달 → 증여세 경고 (기본 80%)
```

### 알림 임계값 설정

```prisma
model AlertConfig {
  id        String   @id @default(cuid())
  key       String   @unique     // "price_drop_pct", "fx_change_krw", "budget_pct"
  value     Float                // -5, 50, 80 등
  label     String               // 사람이 읽을 수 있는 라벨
  updatedAt DateTime @updatedAt
}
```

**텔레그램 커맨드:**
```
/알림설정                          → 현재 임계값 목록 표시
/알림설정 급락 -3                   → 종목 -3% 이상 하락 시 알림
/알림설정 환율 30                   → 환율 ±30원 변동 시 알림
/알림설정 예산 90                   → 소비 예산 90% 도달 시 경고
/알림설정 초기화                    → 기본값으로 리셋
```

**기본값 (시드):**
| key | value | label |
|-----|-------|-------|
| price_drop_pct | -5 | 급락 알림 (%) |
| price_surge_pct | 8 | 급등 알림 (%) |
| fx_change_krw | 50 | 환율 변동 (원) |
| budget_pct | 80 | 예산 경고 (%) |
| gift_tax_pct | 80 | 증여 한도 경고 (%) |

### 구현

```
src/bot/
├── notifications/
│   ├── daily-summary.ts      # 매일 포트폴리오 요약
│   ├── monthly-report.ts     # 월간 리포트
│   ├── price-alert.ts        # 급등락 알림
│   ├── budget-alert.ts       # 예산 경고
│   └── scheduler.ts          # node-cron 알림 스케줄러
```

---

## Phase 11: 모닝 브리핑 + 전략 맞춤 AI 어드바이저

### 목표
매일 장 시작 전 보유 종목 뉴스·동향을 수집하고,
**계좌별·종목별 투자 전략에 맞는 맞춤 조언**을 AI가 생성해서 텔레그램으로 보낸다.
세진 계좌는 스윙/단기 매매까지 기술적 분석 기반 타이밍을 제안받을 수 있다.

---

### 11-A: 종목별 전략 태그 시스템

3계좌가 완전히 다른 성격이고, 세진 계좌 안에서도 종목마다 전략이 다르다:

```
소담 계좌 (10년 장기)
  → 모든 종목: "장기보유" 고정
  → 조언: 계획대로 보유, 특이사항만 알림

다솜 계좌 (15년 성장)
  → 모든 종목: "장기보유" 고정
  → 조언: 계획대로 보유, 특이사항만 알림

세진 계좌 (혼합 전략) — 종목마다 다름
  → RKLB:  "장기보유" (미실현 +436%, 홀드)
  → AAPL:  "장기보유"
  → MSFT:  "장기보유"
  → NVDA:  "스윙" (반도체 사이클에 따라 비중 조절)
  → 컨텍:  "감시" (분기 점검 후 매도 or 홀드 결정)
  → 새 종목: "스윙" / "단타" / "모멘텀" 등 자유 설정
```

**전략 타입 정의:**

```typescript
type HoldingStrategy =
  | 'long_hold'    // 장기보유 — 매도 없이 유지, 뉴스 요약만
  | 'swing'        // 스윙 — 수일~수주 보유, TA 기반 진입/청산 타이밍
  | 'momentum'     // 모멘텀 — 추세 추종, 돌파/이탈 시그널
  | 'value'        // 가치투자 — 펀더멘털 기반, 저평가 구간 매수
  | 'watch'        // 감시 — 보유 중이나 매도 검토 중, 조건 모니터링
  | 'scalp';       // 단타 — 당일~1-2일, 기술적 지표 집중

interface HoldingStrategyConfig {
  strategy: HoldingStrategy;
  memo?: string;              // "3만원 돌파 시 추가 매수" 등
  targetPrice?: number;       // 목표가 (있으면)
  stopLoss?: number;          // 손절가 (있으면)
  entryZone?: [number, number]; // 매수 희망 구간
  reviewDate?: Date;          // 다음 점검일 (컨텍 등)
}
```

**텔레그램으로 전략 변경:**

```
/전략 NVDA 스윙                    → NVDA를 스윙으로 변경
/전략 NVDA 스윙 "3일선 돌파 매수"    → 메모 추가
/전략 NVDA 목표가 160               → 목표가 설정
/전략 NVDA 손절 110                 → 손절가 설정
/전략 NVDA 매수구간 120 130         → 매수 희망 구간
/전략 컨텍 감시 점검일 2026-06-01   → 다음 점검일 설정
/전략목록                           → 전체 종목 전략 현황
```

**DB 스키마:**

```prisma
model HoldingStrategy {
  id          String   @id @default(cuid())
  holdingId   String
  holding     Holding  @relation(fields: [holdingId], references: [id])
  strategy    String   @default("long_hold")  // long_hold, swing, momentum, ...
  memo        String?                          // 자유 메모
  targetPrice Float?                           // 목표가
  stopLoss    Float?                           // 손절가
  entryLow    Float?                           // 매수 구간 하한
  entryHigh   Float?                           // 매수 구간 상한
  reviewDate  DateTime?                        // 다음 점검일
  updatedAt   DateTime @updatedAt

  @@unique([holdingId])                        // 종목당 1개
}
```

---

### 11-B: 관심종목 워치리스트

보유 중이 아니지만 진입을 고려하는 종목을 관리한다.
전략 태그, 목표 매수가, 진입 조건을 설정하고
모닝 브리핑에서 조건 충족 여부를 자동 모니터링한다.

**DB 스키마:**

```prisma
model Watchlist {
  id          String   @id @default(cuid())
  ticker      String   @unique
  displayName String
  market      String                           // "US", "KR"
  strategy    String   @default("swing")       // swing, momentum, value, scalp
  memo        String?                          // "RSI 30 이하 진입", "실적 후 판단"
  targetBuy   Float?                           // 목표 매수가
  entryLow    Float?                           // 매수 구간 하한
  entryHigh   Float?                           // 매수 구간 상한
  alertEnabled Boolean @default(true)
  addedAt     DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

**핵심 흐름:**

```
관심종목 등록 (/관심 SOFI 스윙 "RSI 30 이하 진입" 매수구간 7.5 8.5)
      ↓
매일 모닝 브리핑 시:
  1. 관심종목에도 TA 지표 계산 (RSI, MACD, BB 등)
  2. 진입 조건 자동 평가
     - targetBuy 도달 여부
     - entryLow~entryHigh 구간 진입 여부
     - 메모의 조건 (AI가 해석: "RSI 30 이하 진입")
  3. 조건 충족 시 브리핑에 🔔 하이라이트 표시
      ↓
실제 매수 후: /매수 SOFI 세진 100주 8.20 → 자동으로 워치리스트에서 제거,
               Holding + HoldingStrategy로 전환
```

**텔레그램 커맨드:**

```
/관심 [종목]                       → 관심종목 추가 (기본 스윙)
/관심 [종목] [전략] "[메모]"        → 전략 + 메모 포함
/관심 [종목] 매수구간 [하한] [상한]  → 매수 희망 구간
/관심삭제 [종목]                    → 관심종목 제거
/관심목록                          → 전체 관심종목 + 현재가 + TA 요약
```

**관심목록 출력 예시:**

```
👀 관심종목 (3)

SOFI $8.72 (+1.3%) — 스윙
  RSI(14): 34.2 📉 과매도 근접
  매수구간 $7.50~$8.50 | 현재가 구간 위
  메모: "RSI 30 이하 진입"
  → ⏳ 조건 미충족 (RSI 34 > 30)

PLTR $82.30 (-0.5%) — 모멘텀
  RSI(14): 58.1 | MACD: 골든크로스 5일차
  목표 매수가 $75.00 | 현재가 $82.30
  → ⏳ 목표가 미도달

AMD $165.40 (+2.8%) — 가치투자
  PER(F): 22.3x | 목표가 $180
  매수구간 $150~$160
  → ⏳ 구간 위
```

**모닝 브리핑 내 관심종목 섹션:**

```
━━━ 👀 관심종목 ━━━
🔔 SOFI $7.45 (-3.2%) — RSI 28.7 → 진입 조건 충족!
   매수구간 $7.50~$8.50 내 진입. 메모: "RSI 30 이하 진입" ✅
   ▶️ 진입 고려 타이밍. 지지선 $7.20 확인.

PLTR $82.30 — 목표가 $75 미도달. 대기.
AMD $165.40 — 구간 $150~160 미진입. 대기.
```

---

### 11-C: 기술적 분석 엔진

스윙/모멘텀/단타 전략 종목에는 AI에게 **기술적 지표 데이터**를 함께 전달해야
구체적인 타이밍 조언이 가능하다.

**기술 스택:**

```
yahoo-finance2 historical() → OHLCV 데이터 (90일~200일)
              ↓
trading-signals (npm)       → RSI, MACD, BB, SMA, EMA 계산
              ↓
구조화된 TA 리포트 JSON      → Claude AI에 전달
```

`trading-signals` 선택 이유:
- 최신 유지 (v7.4.3, 활발한 업데이트)
- 내장 `getSignal()` → BEARISH / BULLISH / SIDEWAYS 자동 판정
- 204kB 경량, 의존성 없음, TypeScript 네이티브

**기술적 분석 모듈:**

```typescript
// src/lib/technical-analysis.ts
import { RSI, MACD, BollingerBands, SMA, EMA } from 'trading-signals';
import yahooFinance from 'yahoo-finance2';

interface TAReport {
  ticker: string;
  period: string;              // "2026-01-01 ~ 2026-03-04"
  price: {
    current: number;
    change1d: number;          // 전일 대비 %
    change5d: number;          // 5일 대비 %
    change20d: number;         // 20일 대비 %
    high52w: number;           // 52주 최고
    low52w: number;            // 52주 최저
    fromHigh52w: number;       // 고점 대비 % (예: -12.3%)
  };
  indicators: {
    rsi14: { value: number; signal: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL' };
    macd: {
      macd: number;
      signal: number;
      histogram: number;
      trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
      crossover?: 'GOLDEN' | 'DEAD';  // 최근 3일 내 크로스
    };
    bollingerBands: {
      upper: number;
      middle: number;
      lower: number;
      position: 'ABOVE_UPPER' | 'NEAR_UPPER' | 'MIDDLE' | 'NEAR_LOWER' | 'BELOW_LOWER';
      bandwidth: number;       // 밴드폭 (변동성)
    };
    sma: {
      sma20: number;
      sma50: number;
      sma200: number;
      priceVsSma20: number;    // 20일선 대비 % 괴리
      goldenCross?: boolean;   // 50일선이 200일선 상향 돌파
      deathCross?: boolean;    // 50일선이 200일선 하향 돌파
    };
    volume: {
      current: number;
      avg20d: number;
      ratio: number;           // 현재/평균 비율
      surge: boolean;          // 평균 대비 2배 이상
    };
  };
  support: number[];            // 주요 지지선 (최근 저점들)
  resistance: number[];         // 주요 저항선 (최근 고점들)
  signalSummary: {
    overall: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';
    reasons: string[];          // ["RSI 과매도 진입", "MACD 골든크로스 임박"]
  };
}

async function generateTAReport(ticker: string): Promise<TAReport> {
  // 200일치 일봉 데이터
  const historical = await yahooFinance.historical(ticker, {
    period1: subDays(new Date(), 250),
    period2: new Date(),
    interval: '1d',
  });

  const closes = historical.map(d => d.close);
  const highs = historical.map(d => d.high);
  const lows = historical.map(d => d.low);
  const volumes = historical.map(d => d.volume);

  // RSI (14)
  const rsi = new RSI(14);
  closes.forEach(c => rsi.update(c));

  // MACD (12, 26, 9)
  const macd = new MACD({ indicator: EMA, longInterval: 26,
                           shortInterval: 12, signalInterval: 9 });
  closes.forEach(c => macd.update(c));

  // Bollinger Bands (20, 2)
  const bb = new BollingerBands(20, 2);
  closes.forEach(c => bb.update(c));

  // SMA 20 / 50 / 200
  const sma20 = new SMA(20), sma50 = new SMA(50), sma200 = new SMA(200);
  closes.forEach(c => { sma20.update(c); sma50.update(c); sma200.update(c); });

  // ... 지표 계산 → 구조화된 TAReport 반환
  return buildReport(/* ... */);
}
```

**지지/저항선 자동 탐지:**

```typescript
// 최근 60일 데이터에서 로컬 최저/최고점 추출
function findSupportResistance(
  highs: number[], lows: number[], window: number = 5
): { support: number[]; resistance: number[] } {
  const support: number[] = [];
  const resistance: number[] = [];

  for (let i = window; i < lows.length - window; i++) {
    const isSupport = lows.slice(i - window, i).every(l => l >= lows[i])
      && lows.slice(i + 1, i + window + 1).every(l => l >= lows[i]);
    if (isSupport) support.push(lows[i]);

    const isResist = highs.slice(i - window, i).every(h => h <= highs[i])
      && highs.slice(i + 1, i + window + 1).every(h => h <= highs[i]);
    if (isResist) resistance.push(highs[i]);
  }

  return {
    support: [...new Set(support)].sort((a, b) => b - a).slice(0, 3),
    resistance: [...new Set(resistance)].sort((a, b) => a - b).slice(0, 3),
  };
}
```

---

### 11-D: 전략별 맞춤 조언 로직

AI에게 전달하는 데이터 범위와 프롬프트가 전략 타입에 따라 달라진다:

```
┌─────────────────────────────────────────────────────────────┐
│                    종목별 조언 분기                          │
├──────────┬──────────────────────────────────────────────────┤
│          │ 전달 데이터          조언 내용                   │
├──────────┼──────────────────────────────────────────────────┤
│ 장기보유  │ 뉴스 + 실적일정      "계획대로 유지"             │
│ (소담,   │ + 컨센서스           특이사항 있을 때만 언급       │
│  다솜)   │                     구체적 매매 의견 없음         │
├──────────┼──────────────────────────────────────────────────┤
│ 장기보유  │ 뉴스 + 실적일정      미실현 손익 현황             │
│ (세진    │ + 컨센서스           홀드 근거 확인                │
│  RKLB등) │                     "매도 고려 구간" 참고만       │
├──────────┼──────────────────────────────────────────────────┤
│ 스윙     │ 뉴스 + TA 리포트     RSI/MACD 기반 매수·매도 구간 │
│          │ + 지지저항선          목표가/손절가 대비 현재 위치  │
│          │ + 전략 메모          진입/청산 타이밍 의견          │
│          │ + 볼린저밴드         추세 방향 + 변동성 판단       │
├──────────┼──────────────────────────────────────────────────┤
│ 모멘텀   │ 뉴스 + TA 리포트     추세 강도 (ADX)              │
│          │ + 거래량 분석        돌파 시그널 / 이탈 경고       │
│          │ + SMA 크로스         눌림목 매수 구간 제안         │
├──────────┼──────────────────────────────────────────────────┤
│ 가치투자  │ 뉴스 + 펀더멘털      PER/PBR/EPS 대비 현재가     │
│          │ + 재무제표           적정가 대비 할인율            │
│          │ + 컨센서스           매수 구간 의견                │
├──────────┼──────────────────────────────────────────────────┤
│ 감시     │ 뉴스 + TA + 메모     점검 기준 달성 여부           │
│ (컨텍)   │ + 점검일 D-day       매도/홀드 판단 근거           │
│          │                     "점검일 D-7" 리마인드         │
├──────────┼──────────────────────────────────────────────────┤
│ 단타     │ TA 리포트 집중       당일 지지/저항선              │
│          │ + 프리마켓 동향      진입가 / 목표가 / 손절가      │
│          │ + 거래량 급증 여부   리스크 경고                   │
└──────────┴──────────────────────────────────────────────────┘
```

**프롬프트 분기 로직:**

```typescript
// src/bot/notifications/briefing-prompt.ts

function buildHoldingPrompt(holding: HoldingWithStrategy): string {
  const { strategy, memo, targetPrice, stopLoss } = holding.strategyConfig;

  switch (strategy) {
    case 'long_hold':
      return `
[${holding.ticker}] 전략: 장기보유
계좌: ${holding.accountName}
보유: ${holding.shares}주, 평단 ${holding.avgPrice}
현재가: ${holding.currentPrice} (${holding.changePercent}%)
뉴스와 실적 일정만 간략히. 매매 의견 없이 "보유 유지" 확인.`;

    case 'swing':
      return `
[${holding.ticker}] 전략: 스윙 트레이딩
보유: ${holding.shares}주, 평단 ${holding.avgPrice}
현재가: ${holding.currentPrice} (${holding.changePercent}%)
${targetPrice ? `목표가: ${targetPrice}` : ''}
${stopLoss ? `손절가: ${stopLoss}` : ''}
${memo ? `메모: ${memo}` : ''}

[기술적 분석]
${JSON.stringify(holding.taReport.indicators, null, 2)}
지지선: ${holding.taReport.support.join(', ')}
저항선: ${holding.taReport.resistance.join(', ')}
시그널 종합: ${holding.taReport.signalSummary.overall}

WebSearch로 최신 뉴스를 확인하고, 다음을 제공:
1. 현재 기술적 위치 해석 (이동평균/RSI/MACD 종합)
2. 단기 매수/매도 타이밍 의견 (구체적 가격대)
3. 목표가/손절가 대비 현재 위치, 조정 필요 여부
4. 주의할 이벤트나 리스크`;

    case 'momentum':
      return `
[${holding.ticker}] 전략: 모멘텀
현재가: ${holding.currentPrice}, 추세: ${holding.taReport.signalSummary.overall}
SMA20: ${holding.taReport.indicators.sma.sma20}
SMA50: ${holding.taReport.indicators.sma.sma50}
거래량 비율: ${holding.taReport.indicators.volume.ratio}x

추세 지속 여부, 돌파/이탈 시그널, 눌림목 매수 구간 제안.`;

    case 'watch':
      return `
[${holding.ticker}] 전략: 감시 (매도 검토 중)
보유: ${holding.shares}주, 평단 ${holding.avgPrice}
현재가: ${holding.currentPrice} (미실현 ${holding.unrealizedPnLPercent}%)
${memo ? `점검 기준: ${memo}` : ''}
${holding.strategyConfig.reviewDate
  ? `다음 점검일: ${holding.strategyConfig.reviewDate} (D-${daysUntil(holding.strategyConfig.reviewDate)})`
  : ''}

점검 기준 대비 현재 상태를 평가하고, 매도/홀드 판단 근거 제시.`;

    case 'scalp':
      return `
[${holding.ticker}] 전략: 단타
현재가: ${holding.currentPrice}
${targetPrice ? `목표가: ${targetPrice}` : ''}
${stopLoss ? `손절가: ${stopLoss}` : ''}

[TA 핵심]
RSI: ${holding.taReport.indicators.rsi14.value}
BB 위치: ${holding.taReport.indicators.bollingerBands.position}
거래량: ${holding.taReport.indicators.volume.ratio}x (평균 대비)
지지: ${holding.taReport.support[0]}, 저항: ${holding.taReport.resistance[0]}

오늘 진입/청산 판단에 필요한 핵심 정보만 간결하게.
프리마켓 동향, 당일 지지/저항, 리스크 경고.`;

    case 'value':
      return `
[${holding.ticker}] 전략: 가치투자
현재가: ${holding.currentPrice}
PER: ${holding.fundamentals.trailingPE}
PBR: ${holding.fundamentals.priceToBook}
EPS 추정: ${holding.fundamentals.forwardEps}
애널리스트 목표가: ${holding.fundamentals.targetMeanPrice}

적정가 대비 현재 할인율, 매수 매력도, 리스크 평가.`;
  }
}
```

---

### 11-E: 개선된 브리핑 구조

전략 태그 시스템이 적용된 브리핑은 계좌별로 섹션이 나뉜다:

**브리핑 예시 (미국장):**

```
📊 모닝 브리핑 — 2026.03.05 (목) 🇺🇸

━━━ 시장 동향 ━━━
S&P500 선물 +0.3%, 나스닥 +0.5%
FOMC 의사록 — 금리 동결 기조 유지.
반도체 섹터 강세, 필라델피아 반도체지수 +1.8%.

━━━ 👧 소담 · 👶 다솜 (장기보유) ━━━
AAPL $243.20 (+1.2%) — AI iPhone SE 4 기대감. ✅ 계획대로 유지.
XAR $198.20 (+0.3%) — 국방 예산 상향. ✅ 양호.
다솜 RKLB $32.40 (-0.5%) — Electron 발사 예정. ✅ 15년 성장주 유지.
→ 두 계좌 모두 특이사항 없음. 장기 보유 유지.

━━━ 💼 세진 (능동 관리) ━━━

🔒 장기보유
  RKLB $32.40 (-0.5%) | +436% 미실현
    Neutron 진척, Electron 내주 발사. 홀드 유지.
  AAPL $243.20 (+1.2%) | 실적 D-12
    AI 사이클 수혜. 실적 전 안정적. 유지.
  MSFT $445.80 (+0.8%)
    Azure AI 호조. 유지.

📈 스윙 — NVDA $138.50 (+2.1%)
  RSI(14): 62.3 (중립), MACD: 골든크로스 2일차
  BB: 중간대, 밴드폭 수축 → 방향성 돌파 임박
  지지 $130.20 / 저항 $145.80
  ▶️ 현재 위치: 20일선 위 안착, 추세 양호
  ▶️ 타이밍: $145 저항 돌파 시 추가 매수 고려
     손절 $128 하향 이탈 시 비중 축소
  ▶️ 주의: 3/19 FOMC — 변동성 확대 가능

👀 감시 — 컨텍 ₩15,200 (-3.2%)
  미실현 -32.4% | 다음 점검: 2026-06-01 (D-88)
  거래량 평균 이하, 반등 모멘텀 부재.
  점검 기준: "2분기 매출 턴어라운드 확인"
  ▶️ 현재: 기준 미충족. 예정대로 6월 점검 대기.

━━━ 오늘 주목 ━━━
📅 AAPL 실적 D-12 (3/17)
📅 FOMC D-14 (3/19) — NVDA 스윙 포지션 변동성 주의
📅 컨텍 점검 D-88 (6/01)

ℹ️ 참고용 정보이며 투자 권유가 아닙니다.
```

---

### 11-F: 수동 트리거 — 종목 심층 분석

`/브리핑 NVDA` 같은 수동 요청 시, 해당 종목만 심층 분석:

```typescript
// 심층 분석 시 추가 데이터
interface DeepAnalysis extends TAReport {
  fundamentals: {
    trailingPE: number;
    forwardPE: number;
    priceToBook: number;
    debtToEquity: number;
    forwardEps: number;
    revenueGrowth: number;
    targetMeanPrice: number;     // 애널리스트 평균 목표가
    recommendationKey: string;   // "buy", "hold", "sell"
    numberOfAnalysts: number;
  };
  options?: {
    impliedVolatility: number;   // 옵션 내재변동성
    putCallRatio: number;
  };
  institutional: {
    heldByInstitutions: number;  // 기관 보유 비율
    heldByInsiders: number;
    recentInsiderTrades: string; // "순매수" | "순매도" | "없음"
  };
}
```

**텔레그램 심층 분석 예시:**

```
📊 NVDA 심층 분석 — 2026.03.05

━━━ 기술적 분석 ━━━
현재가: $138.50 (+2.1%)
52주: $82.30 ~ $152.80 (고점 대비 -9.4%)

RSI(14): 62.3 — 중립 (과매수 근접 아님)
MACD: +2.14 (시그널 +1.82) — 골든크로스 2일차 🟢
BB(20,2): $126.40 ~ $148.60 — 중간대 상단
SMA20: $132.10 (위), SMA50: $128.40 (위), SMA200: $118.60 (위)
거래량: 평균 대비 1.3x — 소폭 증가

지지선: $130.20, $126.40, $118.60
저항선: $145.80, $148.60, $152.80 (52주 고점)

━━━ 펀더멘털 ━━━
PER(T): 42.3x | PER(F): 35.8x
EPS 추정: $3.87 (+28% YoY)
매출 성장률: +62% (Azure AI 효과)
애널리스트: Buy (38명), 평균 목표가 $165

━━━ 수급 ━━━
기관 보유: 72.4%
최근 내부자: 순매도 (소량, 정기 처분)

━━━ 전략 의견 ━━━
현재 전략: 스윙 | 목표가: - | 손절: -

▶️ 종합 시그널: 매수 우위 (BUY)
  • MACD 골든크로스 + 20일선 안착 → 단기 상승 모멘텀
  • 볼린저밴드 상단 접근 → $145~148 저항 테스트 예상
  • 추천 진입: $132~135 (20일선 눌림목)
  • 추천 청산: $145~148 (BB 상단 + 이전 저항)
  • 손절 제안: $126 하향 이탈 시

⚠️ 리스크:
  • FOMC 3/19 — 금리 관련 변동성
  • PER 40x 이상 → 실적 미스 시 급락 위험

ℹ️ 참고용 정보이며 투자 권유가 아닙니다.
```

---

### 브리핑 타이밍

```
🇰🇷 한국장 브리핑: KST 08:30 (장 개장 30분 전)
   대상: TIGER S&P500, SOL 배당다우존스, SOL 미국채혼합50,
         두산로보틱스, 카카오, 컨텍
   + 코스피/코스닥 전일 동향, 원달러 환율, 아시아 시장

🇺🇸 미국장 브리핑: KST 23:00 (장 개장 30분 전, 서머타임 22:00)
   대상: AAPL, MSFT, NVDA, RKLB, XAR
   + S&P500 선물, 나스닥 선물, 글로벌 매크로 이슈
```

### 아키텍처

```
┌──────────────────────────────────────────────────┐
│ node-cron 스케줄러 (08:30 KST / 23:00 KST)      │
└──────────┬───────────────────────────────────────┘
           ▼
┌──────────────────────────────────────────────────┐
│ 1단계: 데이터 수집 (Node.js)                     │
│                                                  │
│  yahoo-finance2:                                 │
│   • quote() — 전일 종가, 등락률, 거래량          │
│   • historical() — 200일 OHLCV (TA 대상 종목)    │
│   • quoteSummary(['recommendationTrend',         │
│     'earningsTrend', 'calendarEvents',           │
│     'financialData', 'defaultKeyStatistics'])    │
│                                                  │
│  trading-signals:                                │
│   • RSI, MACD, BB, SMA, EMA 계산                │
│   • 지지/저항선 탐지                              │
│   • signalSummary 생성                           │
│                                                  │
│  포트폴리오 DB:                                  │
│   • 보유종목 + 수량 + 평가손익                   │
│   • 종목별 전략 태그 + 메모 + 목표가/손절가       │
│   • 계좌별 전략 (장기/밸런스/성장)                │
└──────────┬───────────────────────────────────────┘
           │ 전략별로 다른 데이터 패키지
           ▼
┌──────────────────────────────────────────────────┐
│ 2단계: AI 분석 (claude -p + WebSearch)           │
│                                                  │
│  전략별 분기:                                    │
│   • 장기보유 → 뉴스 + 컨센서스만 → 간략 확인     │
│   • 스윙/모멘텀 → TA 리포트 + 뉴스 → 타이밍 의견 │
│   • 감시 → 점검 기준 + 현황 → 판단 근거          │
│   • 단타 → TA 집중 + 프리마켓 → 진입/청산 의견   │
│   • 가치 → 펀더멘털 + 뉴스 → 적정가 분석         │
│                                                  │
│  Claude WebSearch:                               │
│   • 종목별 최신 뉴스                             │
│   • 매크로 동향                                  │
│   • 섹터/업종 뉴스                               │
└──────────┬───────────────────────────────────────┘
           ▼
┌──────────────────────────────────────────────────┐
│ 3단계: 전달                                      │
│  📱 텔레그램 전송 (계좌별 섹션)                   │
│  💾 Briefing DB 저장                              │
│  🌐 웹 대시보드 (AI 탭 + TA 차트)                │
└──────────────────────────────────────────────────┘
```

### 뉴스 소스 전략

| 소스 | 역할 | 방법 |
|------|------|------|
| yahoo-finance2 `search()` | 종목별 기본 뉴스 (영문) | `news[]` 배열 |
| yahoo-finance2 `quoteSummary` | 컨센서스, 실적 일정, 펀더멘털 | 다중 모듈 |
| yahoo-finance2 `historical` | OHLCV 데이터 → TA 계산 입력 | 200일 일봉 |
| trading-signals | RSI, MACD, BB, SMA 등 기술적 지표 | 로컬 계산 |
| Claude WebSearch | **메인** — 최신 한/영 뉴스, 매크로 | 종목명 + "뉴스" 검색 |
| Claude WebFetch | 주요 기사 본문 읽기 | 검색 결과 URL |

### DB 스키마 추가

```prisma
model HoldingStrategy {
  id          String   @id @default(cuid())
  holdingId   String   @unique
  holding     Holding  @relation(fields: [holdingId], references: [id])
  strategy    String   @default("long_hold")
  memo        String?
  targetPrice Float?
  stopLoss    Float?
  entryLow    Float?
  entryHigh   Float?
  reviewDate  DateTime?
  updatedAt   DateTime @updatedAt
}

model Briefing {
  id        String   @id @default(cuid())
  market    String               // "KR" | "US"
  type      String   @default("morning")  // "morning" | "manual" | "deep_analysis"
  date      DateTime
  content   String
  metadata  Json?
  createdAt DateTime @default(now())

  @@unique([market, date, type])
}
```

### Max 플랜 사용량 관리

```
장기보유 종목 (~9개): 뉴스만 → AI 부담 낮음
능동 전략 종목 (~3개): TA + 뉴스 + 심층 분석 → AI 부담 높음

절약 전략:
1. TA 계산은 100% 로컬 (trading-signals) → AI 토큰 절약
2. 장기보유 종목은 묶어서 간략 처리 → 검색 횟수 절약
3. 능동 종목만 개별 심층 검색
4. Haiku (뉴스 수집) → Sonnet (최종 전략 분석) 2단계
5. 주말/공휴일 스킵
```

### 파일 구조

```
src/lib/
├── technical-analysis.ts    # TA 지표 계산 엔진 (trading-signals)
├── support-resistance.ts    # 지지/저항선 탐지
├── signal-summary.ts        # 종합 시그널 판정 (STRONG_BUY~STRONG_SELL)
├── watchlist-store.ts       # Watchlist DB CRUD + 조건 평가
├── claude-advisor.ts        # claude -p 래퍼
└── briefing-store.ts        # Briefing DB CRUD

src/bot/notifications/
├── morning-briefing.ts      # 메인 오케스트레이션
├── briefing-prompt.ts       # 전략별 프롬프트 분기 로직
├── data-collector.ts        # yahoo-finance2 데이터 수집 (TA용 확장)
├── market-calendar.ts       # 장 개장일/공휴일/서머타임
└── scheduler.ts             # cron 스케줄러

src/bot/commands/
├── strategy.ts              # /전략, /전략목록 커맨드 핸들러
├── watchlist.ts             # /관심, /관심목록, /관심삭제 커맨드
└── briefing.ts              # /브리핑, /브리핑설정 커맨드
```

### 텔레그램 커맨드

```
전략 관리:
  /전략 [종목] [타입]                  → 전략 변경
  /전략 [종목] [타입] "[메모]"          → 메모 포함
  /전략 [종목] 목표가 [가격]            → 목표가 설정
  /전략 [종목] 손절 [가격]              → 손절가 설정
  /전략 [종목] 매수구간 [하한] [상한]   → 매수 희망 구간
  /전략 [종목] 점검일 [YYYY-MM-DD]     → 다음 점검일
  /전략목록                            → 전체 종목 전략 현황

관심종목:
  /관심 [종목]                         → 관심종목 추가 (기본 스윙)
  /관심 [종목] [전략] "[메모]"          → 전략 + 메모 포함
  /관심 [종목] 매수구간 [하한] [상한]    → 매수 희망 구간
  /관심삭제 [종목]                      → 관심종목 제거
  /관심목록                            → 전체 관심종목 + 현재가 + TA

브리핑:
  /브리핑                → 즉시 브리핑 (전체)
  /브리핑 [종목]          → 특정 종목 심층 분석
  /브리핑설정             → 자동 브리핑 ON/OFF, 시간 변경
  /브리핑히스토리         → 최근 7일 브리핑 목록

실시간 분석 (수동):
  /분석 [종목]            → TA 리포트만 (AI 없이, 즉시)
  /시그널                 → 전체 능동 종목 + 관심종목 시그널 요약

알림 설정 (Phase 10):
  /알림설정               → 현재 임계값 목록 표시
  /알림설정 급락 [-N]      → 급락 알림 임계값 변경
  /알림설정 환율 [±N]      → 환율 변동 임계값 변경
  /알림설정 예산 [N]       → 예산 경고 임계값 변경
  /알림설정 초기화         → 기본값 리셋
```

---

## 마일스톤 요약

| Phase | 내용 | 예상 기간 | 의존성 |
|-------|------|----------|--------|
| **7** | 텔레그램 봇 기본 (매매 기록, 조회) | 2주 | Phase 1~3 |
| **8** | 소비/수입 관리 (텔레그램 입력 + 웹 차트) | 2주 | Phase 7 |
| **9** | Claude AI 어드바이저 (MCP Tool Use) | 2~3주 | Phase 7, 8 |
| **10** | 알림 + 자동화 | 1~2주 | Phase 7, 9 |
| **11** | 모닝 브리핑 + 전략 맞춤 AI 어드바이저 | 3~4주 | Phase 9, 10 |

### 선행 조건

- Telegram BotFather에서 봇 생성 → 토큰 발급
- .env에 추가:
  ```
  TELEGRAM_BOT_TOKEN=...
  TELEGRAM_ALLOWED_CHAT_IDS=123456,789012  # 가족 Chat ID
  DATABASE_URL=postgresql://myfinance:password@localhost:5432/myfinance
  PROJECT_ROOT=/path/to/myFinance
  ```
- 서버에 Claude Code CLI가 설치되어 있고 Max 플랜으로 로그인된 상태여야 함
  (`claude login` → Max 플랜 인증 확인, `ANTHROPIC_API_KEY` 환경변수 제거)

### 2차 완료 후 전체 시스템

```
입력                    분석/시각화              AI
─────                  ──────────             ────
텔레그램 봇      ←→    웹 대시보드      ←→    Claude Code CLI
  - 매매 기록            - 포트폴리오              - 포트 분석
  - 소비/수입            - 시뮬레이션              - 소비 조언
  - 빠른 조회            - 세금 센터               - RSU 가이드
  - AI 질문              - 소비 분석               - 분기 리뷰
  - 전략 설정            - TA 차트                 - 모닝 브리핑
  - 알림 수신            - AI 리포트               - 전략 맞춤 조언
  - 모닝 브리핑          - 브리핑 히스토리          - 시장 코멘트

로컬 엔진: trading-signals (RSI, MACD, BB, SMA → 시그널 판정)
DB: PostgreSQL (동시 접근: 웹 + 봇 + cron + AI)
AI: Claude Code CLI (claude -p) + WebSearch — Max 플랜 포함
MCP: myFinance 전용 서버로 DB 도구 제공
```