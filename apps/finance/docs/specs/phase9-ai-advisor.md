# Phase 9: Claude AI 어드바이저

## 목적
포트폴리오 상황과 시장 데이터를 기반으로 AI 인사이트와 조언을 제공한다.
텔레그램 자연어 질문, 웹 AI 분석 탭, 자연어 거래 입력 파싱을 구현한다.

## 서브 이슈

- [ ] **9-A**: MCP 서버 구현 — myFinance 전용 도구 정의 + DB 조회 핸들러
- [ ] **9-B**: Claude Code CLI 래퍼 + 시스템 프롬프트
- [ ] **9-C**: 텔레그램 AI 질문 연동
- [ ] **9-D**: 웹 AI 분석 페이지
- [ ] **9-E**: 자연어 거래 입력 파싱

---

## 9-A: MCP 서버 구현

### 요구사항

- [ ] `@modelcontextprotocol/sdk` 패키지 설치
- [ ] `src/mcp/server.ts` — MCP 서버 메인
- [ ] 포트폴리오 도구: `get_portfolio`, `get_trades`, `get_performance`
- [ ] 세금 도구: `get_gift_tax_status`, `get_dividends`
- [ ] 소비 도구: `get_spending_summary`
- [ ] 시뮬레이션 도구: `simulate_growth`
- [ ] 가격 도구: `get_prices`, `get_fx_rate`
- [ ] stdio 전송 방식 (Claude Code CLI 표준)

### 기술 설계

MCP 서버는 stdio 전송으로 동작하며, Claude Code CLI가 subprocess로 실행한다.

```
Claude Code CLI (claude -p)
    ↕ stdio (JSON-RPC)
MCP Server (node src/mcp/server.js)
    ↕
PostgreSQL (Prisma)
```

**도구 정의:**

| 도구명 | 파라미터 | 설명 |
|--------|----------|------|
| `get_portfolio` | `account_name`: 세진/소담/다솜/전체 | 보유종목 + 현재 가치 + 환차손익 |
| `get_trades` | `account_name`, `days` | 최근 N일 거래 내역 |
| `get_performance` | `account_name`, `period` | TWR 수익률 + 벤치마크 대비 |
| `get_gift_tax_status` | `account_name` | 증여세 현황 (누적/한도/사용률) |
| `get_dividends` | `account_name`, `year` | 배당 수령 내역 + 연간 합계 |
| `get_spending_summary` | `year`, `month` | 월별 소비/수입 요약 |
| `simulate_growth` | `account_name`, `years`, `monthly`, `return_pct` | 미래 성장 시뮬레이션 |
| `get_prices` | `tickers` (선택) | 보유종목 현재가 + 등락률 |
| `get_fx_rate` | - | 현재 USD/KRW 환율 |

### 파일 구조

```
src/mcp/
├── server.ts          # MCP 서버 진입점 (stdio)
├── tools/
│   ├── portfolio.ts   # get_portfolio, get_trades
│   ├── performance.ts # get_performance
│   ├── tax.ts         # get_gift_tax_status, get_dividends
│   ├── spending.ts    # get_spending_summary
│   ├── market.ts      # get_prices, get_fx_rate
│   └── simulator.ts   # simulate_growth
└── utils.ts           # 공통 유틸 (계좌명→ID 변환 등)
```

---

## 9-B: Claude Code CLI 래퍼 + 시스템 프롬프트

### 요구사항

- [ ] `src/lib/claude-advisor.ts` — `claude -p` subprocess 래퍼
- [ ] 시스템 프롬프트 정의 (`src/lib/ai/system-prompt.ts`)
- [ ] `.claude.json` 또는 프로젝트 설정에 MCP 서버 등록
- [ ] 타임아웃 (120초), 에러 핸들링, 일일 호출 제한
- [ ] 모델 선택: 기본 haiku (일상), sonnet (분석)

### 기술 설계

```typescript
// src/lib/claude-advisor.ts
interface AdvisorOptions {
  model?: 'haiku' | 'sonnet'
  timeout?: number  // ms, default 120_000
}

export async function askAdvisor(
  prompt: string,
  options?: AdvisorOptions
): Promise<string>
```

**subprocess 호출:**
```bash
claude -p "<prompt>" \
  --output-format json \
  --model haiku \
  --allowedTools "mcp__myfinance__*"
```

**시스템 프롬프트 핵심:**
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
- 필요한 데이터는 도구를 호출해서 확인
```

**MCP 서버 등록 (.claude.json):**
```json
{
  "mcpServers": {
    "myfinance": {
      "command": "npx",
      "args": ["tsx", "src/mcp/server.ts"]
    }
  }
}
```

---

## 9-C: 텔레그램 AI 질문 연동

### 요구사항

- [ ] `/ai [질문]` 커맨드 핸들러
- [ ] 자연어 fallback (숫자 없는 질문 → AI 전달)
- [ ] "생각 중..." 상태 표시 (typing indicator)
- [ ] 긴 응답 분할 전송 (4096자 제한)
- [ ] 일일 호출 횟수 제한 (30회/일)

### 기술 설계

```
사용자: "다솜 계좌 지금 어때?"
  봇: ⏳ 분석 중...
  → askAdvisor("다솜 계좌 지금 어때?")
  → Claude: get_portfolio("다솜") + get_prices() 호출
  → 응답 생성 → 텔레그램 전송
```

**fallback 우선순위:**
1. 슬래시 커맨드 (`/현황`, `/매수` 등)
2. 명시적 커맨드 (`현황`, `매수` 등)
3. 숫자 포함 → 소비 입력 (기존)
4. 숫자 미포함 → AI 질문 (신규)

### 파일

```
src/bot/commands/ai.ts    # /ai 커맨드 + AI fallback
```

---

## 9-D: 웹 AI 분석 페이지

### 요구사항

- [ ] `/ai` 페이지 (사이드바에 "AI 분석" 메뉴 추가)
- [ ] 질문 입력 → API 호출 → AI 응답 표시
- [ ] 대화 히스토리 (세션 내)
- [ ] 프리셋 질문 버튼 ("전체 현황 분석", "이번 달 소비 분석", "증여세 현황" 등)
- [ ] API: `POST /api/ai/ask` (prompt → response)

### 기술 설계

```
사용자 → 질문 입력 or 프리셋 클릭
  → POST /api/ai/ask { prompt: "..." }
  → askAdvisor(prompt)
  → { response: "..." }
  → 마크다운 렌더링으로 표시
```

### 파일

```
src/app/ai/page.tsx              # SSR 메인
src/app/ai/AIClient.tsx          # 클라이언트 (대화 UI)
src/app/api/ai/ask/route.ts      # POST API
src/components/ai/ChatMessage.tsx # 메시지 버블
src/components/ai/PresetButtons.tsx # 프리셋 질문
```

---

## 9-E: 자연어 거래 입력 파싱

### 요구사항

- [ ] "소담 계좌에서 TIGER S&P500 10주 24900원에 샀어" → 구조화된 Trade
- [ ] AI 파싱 결과를 인라인 키보드로 확인 요청
- [ ] 기존 `/매수`, `/매도` 커맨드와 병행 (AI는 보조)
- [ ] 파싱 실패 시 기존 fallback (소비 입력 또는 AI 질문)

### 기술 설계

자연어 메시지 → AI 파싱 → 구조화된 거래 데이터 → 확인 키보드

```typescript
interface ParsedTrade {
  type: 'buy' | 'sell'
  accountName: string
  ticker: string
  displayName: string
  shares: number
  price: number
  currency: 'KRW' | 'USD'
  fxRate?: number
}
```

**fallback 우선순위 (업데이트):**
1. 슬래시 커맨드
2. 명시적 커맨드 (현황, 매수 등)
3. 숫자 포함 + 거래 키워드 ("샀어", "팔았어", "매수", "매도") → AI 거래 파싱
4. 숫자 포함 → 소비 입력
5. 숫자 미포함 → AI 질문

---

## 제외 사항

- 분기 리뷰 자동 생성 (Phase 13으로 이동)
- 모닝 브리핑 (Phase 11)
- 기술적 분석 엔진 (Phase 11)
- 전략 태그 시스템 (Phase 11)
- 관심종목 워치리스트 (Phase 11)

## 테스트 계획

```bash
npm run lint && npx tsc --noEmit && npm run build
```

수동:
1. MCP 서버 단독 실행 테스트 (`echo '...' | npx tsx src/mcp/server.ts`)
2. `claude -p` 로 MCP 도구 호출 확인
3. 텔레그램 `/ai 전체 현황 분석해줘` → AI 응답 확인
4. 웹 `/ai` 페이지 → 질문 입력 → 응답 렌더링 확인
5. 텔레그램 "소담 TIGER S&P500 10주 24900원 매수" → 거래 파싱 확인
