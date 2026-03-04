# myFinance

가족 자산관리 시스템 — 세진 + 소담(9세) + 다솜(5세), 3개 투자 계좌를 통합 관리하는 웹앱.

개인 서버(Ubuntu)에서 운영하며, 웹 대시보드 · 텔레그램 봇 · Claude AI 어드바이저를 통해 포트폴리오를 조회·분석·관리한다.

## 주요 기능

**1차 마일스톤 — 웹 대시보드**
- 계좌별 보유종목 현황, 평가손익, 수익률 대시보드
- 실시간 주가/환율 자동 갱신 (yahoo-finance2, 장중 10~15분 간격)
- 환차손익 분리 표시 (주가 변동분 vs 환율 변동분)
- 거래 기록 · CSV 임포트 · 배당금 추적
- 증여세/양도소득세/배당소득세 계산기 (참고용)
- 복리 시뮬레이터 · TWR 수익률 분석 · 벤치마크 비교

**2차 마일스톤 — 텔레그램 봇 + AI**
- 텔레그램 봇으로 포트폴리오 조회, 거래 기록, 소비/수입 관리
- Claude AI 어드바이저 (자연어 질의 → 포트폴리오 분석)
- 모닝 브리핑 (시장 뉴스 + 보유종목 TA + 전략별 맞춤 조언)
- 종목별 전략 태그 (long_hold, swing, momentum, value, watch)
- 기술적 분석 엔진 (RSI, MACD, BB, SMA/EMA — trading-signals)

**3차 마일스톤 — 확장**
- 순자산 대시보드 (비주식 자산 포함)
- 분기 리포트 PDF 자동 생성
- 백테스팅 엔진
- 아이들 금융 교육 뷰

## Tech Stack

| 영역 | 기술 |
|------|------|
| Framework | Next.js 14 (App Router, TypeScript) |
| Database | PostgreSQL + Prisma ORM |
| Styling | Tailwind CSS |
| Charts | Recharts |
| Price API | yahoo-finance2 |
| TA Engine | trading-signals (RSI, MACD, BB, SMA/EMA) |
| AI | Claude Code CLI (`claude -p`, Max 플랜) |
| Bot | grammY (텔레그램) |
| Deploy | PM2 + Nginx on Ubuntu |

## System Architecture

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

## 시작하기

### 사전 요구사항

- Node.js 18+
- PostgreSQL 15+
- npm

### 설치

```bash
# 저장소 클론
git clone <repository-url>
cd myFinance

# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env
# .env 파일에 DATABASE_URL, BASE_URL 등 설정
```

### 데이터베이스 설정

```bash
# Prisma 마이그레이션 적용
npx prisma migrate dev

# 시드 데이터 입력 (3계좌 + 보유종목)
npx prisma db seed
```

### 실행

```bash
# 개발 서버
npm run dev

# 프로덕션 빌드 + 실행
npm run build
npm run start
```

## 주요 명령어

```bash
npm run dev              # 개발 서버 (localhost:3000)
npm run build            # 프로덕션 빌드
npm run start            # 프로덕션 실행
npm run lint             # ESLint
npx prisma studio        # DB 브라우저
npx prisma migrate dev   # 마이그레이션 생성+적용 (개발)
npx prisma migrate deploy  # 마이그레이션 적용 (프로덕션)
npx prisma db seed       # 시드 데이터 입력
```

## 프로젝트 구조

```
src/
├── app/                → 페이지 + API Routes (App Router)
├── components/         → React 컴포넌트
│   ├── ui/            → 공통 UI (Card, Badge, Button 등)
│   ├── dashboard/     → 대시보드 컴포넌트
│   ├── trade/         → 거래 관련
│   ├── tax/           → 세금 관련
│   └── simulator/     → 시뮬레이터
├── lib/               → 비즈니스 로직
│   ├── prisma.ts      → Prisma 클라이언트
│   ├── price-fetcher.ts → 주가 조회
│   ├── tax/           → 세금 계산
│   └── simulator/     → 시뮬레이션 엔진
├── bot/               → 텔레그램 봇 (2차 마일스톤)
├── mcp/               → MCP 서버 (AI 어드바이저용)
└── types/             → TypeScript 타입
prisma/
├── schema.prisma      → DB 스키마
└── seed.ts            → 시드 데이터
docs/
├── architecture.md    → 시스템 아키텍처, API 설계
├── data-model.md      → Prisma 스키마 전문, 관계도
├── roadmap.md         → Phase 1~15 구현 계획
├── seed-data.md       → 보유종목 원본 데이터
├── milestone-2.md     → 텔레그램 봇 + AI 어드바이저 상세
├── milestone-3.md     → 순자산 + PDF 리포트 + 백테스팅 상세
└── specs/             → 기능별 상세 스펙
```

## 계좌 구조

| 계좌 | 전략 | 투자 기간 |
|------|------|----------|
| 세진 (본인) | 혼합전략 — 인덱스 확대 + 종목별 전략 태그 | 능동 운용 |
| 소담 (9세) | 균형형 — 배당 ETF + S&P500 중심 | 10년+ |
| 다솜 (5세) | 성장형 — 나스닥/S&P500 + 개별 성장주 | 15년+ |

## 도메인 규칙

- **통화 혼재**: 미국주(USD) + 한국 ETF/주식(KRW). 환차손익은 주가분/환율분 분리 표시.
- **평균단가**: 매수 시 가중평균 재계산, 매도 시 평균단가 유지(이동평균법).
- **증여세 추적**: 미성년 10년간 2,000만원 비과세. Deposit 모델로 누적 관리.
- **RSU**: 카카오 RSU 2회(2026.4, 2027.4). 베스팅 → 매도 → 인덱스 전환 전략.
- **세금 계산**: 모든 결과는 참고용. 법적 조언 아님.

## 배포

PM2 + Nginx로 Ubuntu 서버에 배포.

```bash
# PM2로 실행
pm2 start npm --name myfinance -- start

# Nginx 리버스 프록시 설정
# /etc/nginx/sites-available/myfinance → localhost:3000
```

Phase 1에서는 Nginx basic auth로 외부 접근 차단, Phase 6에서 NextAuth.js PIN 인증으로 업그레이드.

## 개발 워크플로우

```
기획 → 문서화(docs/specs/) → GitHub 이슈 → UI/UX 디자인
→ 구현 계획 → 개발 → 테스트 → 코드 리뷰 → PR → 머지
```

- **브랜치**: `main`(실서비스) → `dev`(개발) → `feat/fix`(dev에서 생성)
- **커밋**: Conventional Commits (`feat:`, `fix:`, `chore:`)
- **테스트**: lint + typecheck + test + build 전부 통과 필수

자세한 규칙은 `docs/roadmap.md` 참조.

## 라이선스

Private — 개인 사용 목적.
