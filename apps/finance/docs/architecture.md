# Architecture

## System Overview

```
Frontend (Next.js SSR/CSR)
    ↕ API Routes
Backend (Prisma + Business Logic)
    ↕
PostgreSQL  ←  Cron (yahoo-finance2)
    ↕                   ↓
Claude Code CLI    trading-signals (TA 엔진, 로컬)
    ↕
Telegram Bot (grammY)
```

## Price Fetching

yahoo-finance2 npm 패키지로 미국주 + 한국주/ETF + 환율을 일괄 조회.

### Ticker Mapping

| 종목 | Yahoo Finance 티커 | 시장 |
|------|-------------------|------|
| AAPL, MSFT, NVDA, RKLB, XAR | 그대로 | US |
| TIGER 미국S&P500 | 360750.KS | KR |
| SOL 미국배당다우존스 | 446720.KS | KR |
| SOL 미국배당미국채혼합50 | 472150.KS | KR |
| 카카오 | 035720.KS | KR |
| 두산로보틱스 | 454910.KS | KR |
| 컨텍 | 241560.KQ | KR |
| 환율 USD/KRW | USDKRW=X | FX |

### Cron Schedule

- 한국 장중 (09:00~15:30 KST): 10분마다
- 미국 장중 (23:30~06:00 KST): 15분마다
- 장 외: 1시간마다
- **PortfolioSnapshot**: 한국장 종료(15:35 KST) + 미국장 종료(06:05 KST) — PriceCache 갱신 완료 후 실행
- **NetWorthSnapshot**: 매월 1일 09:00 (3차 마일스톤 Phase 12)
- 구현: node-cron 또는 /api/cron/prices 엔드포인트 + 시스템 crontab

### Cache Strategy

PriceCache 테이블에 upsert. updatedAt으로 신선도 확인.
대시보드 SSR 시 PriceCache JOIN Holdings로 실시간 가치 계산.

## API Routes

```
# 1차 마일스톤
GET  /api/prices              → 전체 주가 조회 (PriceCache)
POST /api/prices/refresh      → 수동 갱신 트리거
GET  /api/accounts             → 계좌 목록
GET  /api/accounts/:id         → 계좌 상세 (holdings + 현재가 + 환차손익 분리)
POST /api/trades               → 거래 기록 (→ Holding 자동 업데이트)
GET  /api/trades?accountId=    → 거래 내역 조회
POST /api/trades/import        → CSV 임포트 (증권사 거래내역)
POST /api/deposits             → 입금/증여 기록
GET  /api/deposits?accountId=  → 입금 내역 (증여세 추적)
POST /api/simulate             → 시뮬레이션 계산
GET  /api/tax/gift/:accountId  → 증여세 현황
GET  /api/tax/gains/:accountId → 양도소득세 시뮬
GET  /api/tax/dividend/:accountId → 배당소득세 YTD
GET  /api/dividends?accountId= → 배당 수령 내역
POST /api/dividends            → 배당금 기록
GET  /api/dividends/calendar   → 배당 캘린더 (월별 예상 배당)
GET  /api/performance/:accountId → TWR 수익률 + 벤치마크 대비 (기간 파라미터)
GET  /api/export/:type         → 데이터 엑스포트 (trades, dividends, gifts → CSV)

# 2차 마일스톤
GET  /api/watchlist            → 관심종목 목록 + 현재가 + TA 시그널
POST /api/watchlist            → 관심종목 추가
DELETE /api/watchlist/:ticker  → 관심종목 삭제
GET  /api/analysis/:ticker     → TA 리포트 (RSI, MACD, BB, 지지저항)
GET  /api/briefing?date=       → 브리핑 히스토리 조회
POST /api/briefing/trigger     → 수동 브리핑 트리거
GET  /api/alerts/config        → 알림 임계값 목록
PUT  /api/alerts/config/:key   → 알림 임계값 변경

# 3차 마일스톤
GET  /api/assets               → 비주식 자산 목록
POST /api/assets               → 자산 등록/수정
GET  /api/networth             → 순자산 현황 + 추이
GET  /api/reports/:quarter     → 분기 리포트 PDF 다운로드
POST /api/backtest             → 백테스트 실행
```

## Trade → Holding 업데이트 로직

```typescript
// 매수 시
newShares = holding.shares + trade.shares
newAvgPrice = (holding.shares * holding.avgPrice + trade.shares * trade.totalKRW / trade.shares) / newShares

// 매수 시 — avgFxRate 업데이트 (USD 종목)
if (trade.currency === 'USD' && trade.fxRate) {
  newAvgFxRate = (
    holding.shares * (holding.avgFxRate ?? trade.fxRate)
    + trade.shares * trade.fxRate
  ) / newShares
}

// 매도 시 (이동평균법)
newShares = holding.shares - trade.shares
// avgPrice, avgFxRate 변동 없음
```

## Deployment

PM2 + Nginx reverse proxy. HTTPS via Let's Encrypt.
PostgreSQL 백업: pg_dump 매일 cron.

```bash
# PostgreSQL 설정
sudo apt install postgresql
sudo -u postgres createuser myfinance
sudo -u postgres createdb myfinance -O myfinance
```

### 환경변수 전체 목록 (.env)

```bash
# === 1차 마일스톤 (Phase 1~6) ===
DATABASE_URL="postgresql://myfinance:password@localhost:5432/myfinance"
BASE_URL="https://myfinance.example.com"
BASIC_AUTH_USER="sejin"                    # Nginx basic auth (Phase 1)
BASIC_AUTH_PASS="..."                      # Nginx basic auth (Phase 1)
NEXTAUTH_SECRET="..."                      # NextAuth.js (Phase 6 인증 업그레이드)
NEXTAUTH_URL="https://myfinance.example.com"

# === 2차 마일스톤 (Phase 7~11) ===
TELEGRAM_BOT_TOKEN="..."                   # BotFather에서 발급
TELEGRAM_ALLOWED_CHAT_IDS="123456,789012"  # 가족 Chat ID (화이트리스트)
PROJECT_ROOT="/path/to/myFinance"          # Claude Code CLI cwd

# Claude Code CLI는 Max 플랜으로 로그인된 상태 사용 (API 키 불필요)
# `claude login` 후 인증 확인. ANTHROPIC_API_KEY 환경변수 제거할 것.

# === 선택 ===
NODE_ENV="production"
PORT=3000                                  # Next.js 포트 (Nginx 뒤)
TZ="Asia/Seoul"                            # 타임존 (cron 스케줄 기준)
```

참고: 1차 마일스톤 시작 시 상위 4개만 필요. 나머지는 해당 Phase 진입 시 추가.

## Technical Analysis Engine (Phase 11)

```
yahoo-finance2 historical(ticker, 250d)  →  OHLCV 배열
         ↓
trading-signals (npm, 로컬 계산)
  • RSI(14), MACD(12,26,9), BollingerBands(20,2)
  • SMA(20/50/200), EMA(20), Volume 분석
  • 지지/저항선 자동 탐지
         ↓
TAReport JSON  →  Claude AI 프롬프트에 포함
```

핵심 의존성: `trading-signals` (v7.4+, TypeScript, 204kB, 무의존성)
- 내장 `getSignal()` → BEARISH / BULLISH / SIDEWAYS 자동 판정
- TA 계산은 100% 로컬 → AI 토큰 절약, 구조화된 데이터만 Claude에 전달

종목별 전략 태그에 따라 TA 계산 범위가 달라짐:
- `long_hold`: TA 생략 (뉴스+컨센서스만)
- `swing`/`momentum`/`scalp`: 전체 TA + 지지저항 + 시그널
- `value`: TA 경량 + 펀더멘털 중심
- `watch`: TA + 점검 기준 대비 평가
- **Watchlist (관심종목)**: 보유 종목과 동일하게 TA 계산, 진입 조건 자동 평가