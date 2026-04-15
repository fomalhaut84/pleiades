# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

가족 자산관리 시스템 — 세진(본인) + 소담(9세) + 다솜(5세) 3개 투자 계좌를 통합 관리하는 웹앱.
개인 서버(Ubuntu)에서 PM2 + Nginx로 운영.

## Tech Stack

- **Framework**: Next.js 14 (App Router, TypeScript)
- **DB**: PostgreSQL + Prisma ORM
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **Price API**: yahoo-finance2 (미국주 + 한국주/ETF + historical OHLCV)
- **TA Engine**: trading-signals (RSI, MACD, BB, SMA/EMA — 로컬 계산)
- **AI**: Claude Code CLI (`claude -p`, Max 플랜) — `--resume`으로 텔레그램 대화 세션 유지
- **MCP**: 자체 myFinance MCP 서버 (포트폴리오/세금/관심종목/RSU/스톡옵션/가계부 조회 도구)
- **Bot**: grammY (텔레그램 봇, standalone 프로세스로 분리 운영)
- **Deploy**: PM2 + Nginx on Ubuntu (`myfinance` 웹 + `myfinance-bot` standalone 2개 프로세스)

## Commands

```bash
npm run dev              # 개발 서버 (localhost:3000)
npm run build            # 프로덕션 빌드 (Next.js + MCP + Bot 번들)
npm run build:mcp        # MCP 서버만 번들 (esbuild → dist/mcp/server.cjs)
npm run build:bot        # Standalone 봇만 번들 (esbuild → dist/bot/standalone.cjs)
npm run start            # 프로덕션 실행 (웹만)
npm run lint             # ESLint
npx prisma migrate dev   # 마이그레이션 생성+적용 (개발)
npx prisma migrate deploy  # 마이그레이션 적용 (프로덕션)
npx prisma db seed       # 시드 데이터 입력
npx prisma studio        # DB 브라우저 GUI
```

검증 순서 (PR 전 필수):
```bash
npm run lint && npx tsc --noEmit && npm run build
```

배포 (서버):
```bash
./deploy/deploy.sh dev   # dev 브랜치 배포 (웹 + 봇 standalone 양쪽 reload)
```

## Project Structure

```
src/app/              → 페이지 + API routes (App Router)
src/components/       → React 컴포넌트 (ui/, dashboard/, expense/, asset/, tax/, watchlist/, …)
src/lib/              → 비즈니스 로직 (prisma.ts, price-fetcher.ts, market-hours.ts, tax/, ai/, ta/)
src/bot/              → 텔레그램 봇 (commands/, notifications/, utils/, standalone.ts)
src/mcp/              → myFinance MCP 서버 (server.ts + tools/)
src/types/            → TypeScript 타입
prisma/               → schema.prisma + seed + migrations
docs/                 → 설계 문서
docs/designs/         → 승인된 UI/UX 디자인 프로토타입
docs/specs/           → 기능별 상세 스펙 (이슈 번호별)
docs/implementation_plans/ → 구현 계획 (이슈 번호별)
.claude/rules/        → Claude Code용 도메인/워크플로우 규칙
assets/fonts/         → PDF 리포트용 한글 폰트 (Noto Sans KR)
ecosystem.config.js   → PM2 설정 (myfinance + myfinance-bot 2개 프로세스)
```

## Architecture

```
PM2 ──► myfinance (Next.js 웹)            ┐
        ├─ Frontend SSR/CSR               │
        └─ API Routes ──► Prisma ─► PostgreSQL
                                           │
PM2 ──► myfinance-bot (standalone)        │
        ├─ grammY long polling             │
        ├─ Cron (price/snapshot/TA/recurring/vesting)
        └─ Notification Scheduler (daily/briefing/RSU/…)
                                           │
                  Claude Code CLI (claude -p, --resume 세션 유지)
                  └─ MCP: myFinance (자체) + firecrawl (웹)
                  └─ trading-signals (TA 로컬 계산)
                  └─ yahoo-finance2 (시세 + 환율)
```

**핵심 설계 결정:**
- PostgreSQL 선택 이유: 동시 쓰기 채널 다수(웹+봇+cron+AI). SQLite write lock 병목 회피.
- 봇 분리 운영: Next.js webhook 대신 standalone long polling 프로세스 → 응답 지연 해소, 웹/봇 자원 격리. cron + 알림 스케줄러도 봇 프로세스에서 실행.
- AI 어드바이저: Claude API 대신 서버 Claude Code CLI(`claude -p`) subprocess 호출. Max 플랜에 포함. 텔레그램 chat별 `--resume`으로 대화 컨텍스트 유지(`/reset`로 초기화).
- 주가 갱신: node-cron으로 장중 10분, 장외 1시간 간격. PriceCache 테이블에 upsert. 보유 종목 + 관심종목 모두 갱신.
- 거래시간 필터: `src/lib/market-hours.ts`로 한국장(KS/KQ)·미국장(DST 반영) 판별. 장외 시간대 급등락 알림 차단(허위 알림 방지).
- 환율: USDKRW=X 티커로 Yahoo Finance에서 함께 조회. 24시간 알림 허용.
- AI 가이드: TA 시그널 발생 시 stock-trading-method 스킬 기반 1~2줄 가이드 자동 첨부.
- PDF 리포트: Noto Sans KR 폰트 로컬 번들 (assets/fonts/).
- 모바일: 웹은 "조회 + 관리 대시보드", 입력/알림은 텔레그램 중심(자연어 거래/가계부 입력 지원).

## Key Domain Rules

- **계좌별 전략**: 세진=혼합전략(인덱스+종목별 태그), 소담=균형형(10년), 다솜=성장형(15년)
- **종목별 전략 태그**: long_hold, swing, momentum, value, watch, scalp (HoldingStrategy 모델)
- **통화 혼재**: 미국주 USD + 한국 ETF/주식 KRW. Holding에 currency, avgPriceFx, avgFxRate 필드. 환차손익은 주가분/환율분으로 분리 표시.
- **평균단가 계산 (이동평균법)**:
  - 매수: `newAvgPrice = (기존주수×기존평단 + 매수주수×매수단가) / 총주수`
  - 매수(USD): avgFxRate도 같은 방식 가중평균 재계산
  - 매도: 수량만 차감, avgPrice/avgFxRate 변동 없음
- **카테고리 타입**: expense / income / **transfer** (자산 이체용). transfer 거래는 transfer 카테고리만 허용 (양방향 검증).
- **증여세**: 미성년 10년간 2,000만원 비과세. Deposit 모델로 추적. **주식 계좌(accountId) + 비주식 자산(assetId) 모두 합산** (owner별 통합 뷰).
- **자산 관리**: 비주식 자산(주택청약/입출금/적금 등)은 Asset 모델로 관리. 자산 입금 시 Asset.value 트랜잭션 업데이트.
- **RSU**: RSUSchedule 모델. 베스팅일 도래 시 자동 상태 전환 (cron).
- **스톡옵션**: StockOption + StockOptionVesting. 베스팅 자동 활성화(pending→exercisable), 만료 자동 처리. 행사 시 exercisedShares/remainingShares 트랜잭션 업데이트.
- **금액 계산**: 원화는 정수 반올림, 달러는 소수점 2자리. 부동소수점 주의.
- **세금 계산**: 참고용. UI에 항상 면책 문구 표시.
- **거래시간 알림**: 한국 종목은 평일 09:00~15:30 KST, 미국 종목은 미국장 시간대(DST 반영)에만 급등락 알림. 환율/목표가/매수구간 알림은 24시간.

## Coding Conventions

- 한국어 UI, 코드/변수명은 영어.
- 컴포넌트: 함수형 + hooks. default export.
- API routes: `src/app/api/` 아래 route.ts. try-catch + `{ error: string }` 에러 응답.
- DB 접근: 반드시 `@/lib/prisma` singleton. raw query 금지.
- Trade 생성 시 Holding 업데이트는 Prisma transaction으로 묶기.
- 금액 응답에 항상 currency 필드 포함. 날짜는 ISO 8601.
- 차트 컬러 고정: 세진=#34d399, 소담=#60a5fa, 다솜=#fb923c
- 수익률 표시: 양수 초록(+), 음수 빨강(-), 소수점 1자리.
- 커밋: conventional commits (`feat(scope): desc (#issue)`)

## Workflow

모든 기능 개발은 10단계 워크플로우를 따른다. **상세: `.claude/rules/workflow.md`**

```
기획 → 문서화(docs/specs/) → GitHub 이슈 → UI/UX 디자인(frontend-design 스킬)
→ 구현 계획 → 개발 → 테스트 → 코드 리뷰(P1/P2=0까지) → PR → [사용자 머지] → 이슈 종료
```

- 브랜치: `main`(실서비스) → `dev`(개발) → `feat/<issue>-<n>` / `fix/<issue>-<n>` (dev에서 생성, dev로 PR)
- hotfix: main에서 생성 → main + dev 양쪽 머지
- 릴리즈: dev → main 머지 후 `v{major}.{minor}.{patch}` 태그
- PR 머지는 사용자가 직접 수행. `gh` CLI로 이슈/PR 생성.

## Detailed Rules (`.claude/rules/`)

- `api-routes.md` — API route handler 패턴, 에러 응답, 트랜잭션 규칙
- `components.md` — 컴포넌트 규칙, 금액 포맷, 차트 컬러, 면책 문구
- `tax-logic.md` — 증여세/양도소득세/배당소득세/RSU 세율 상세
- `workflow.md` — 10단계 워크플로우 전문, 브랜치/릴리즈/코드리뷰 절차
- `stock-trading-method.md` — 매매 방법론(0~5단계 체크리스트). AI 어드바이저가 종목 추천/분석 시 자동 참조.

## Reference Docs

- `docs/architecture.md` — API 설계, 주가 갱신 로직, 환경변수, TA 엔진
- `docs/data-model.md` — Prisma 스키마 전문, 관계도, ticker 매핑
- `docs/roadmap.md` — 전체 Phase 로드맵 (1~5차 마일스톤)
- `docs/seed-data.md` — 보유종목 원본 데이터
- `docs/examples/dashboard-prototype.jsx` — 대시보드 프로토타입 (디자인·컬러·레이아웃 참고)
- `docs/milestone-2.md` ~ `milestone-3.md` — 마일스톤별 기획 문서
- `docs/specs/<issue>-*.md` — 이슈별 상세 스펙
- `docs/implementation_plans/<issue>-*.md` — 이슈별 구현 계획

## Phase Status

**완료**: Phase 1~21 (5차 마일스톤까지). 현재 추가 개선 작업 중.
**배포**: PostgreSQL + PM2 + Nginx (Ubuntu, finance.starryjeju.net:4100)
전체 로드맵: `docs/roadmap.md`
