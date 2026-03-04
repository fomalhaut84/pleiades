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
- **TA Engine**: trading-signals (RSI, MACD, BB, SMA/EMA — 로컬 계산, Phase 11)
- **AI**: Claude Code CLI (`claude -p`, Max 플랜) — 2차 마일스톤
- **Bot**: grammY (텔레그램 봇, 2차 마일스톤)
- **Deploy**: PM2 + Nginx on Ubuntu

## Commands

```bash
npm run dev              # 개발 서버 (localhost:3000)
npm run build            # 프로덕션 빌드
npm run start            # 프로덕션 실행
npm run lint             # ESLint
npx prisma migrate dev   # 마이그레이션 생성+적용 (개발)
npx prisma migrate deploy  # 마이그레이션 적용 (프로덕션)
npx prisma db seed       # 시드 데이터 입력
npx prisma studio        # DB 브라우저 GUI
```

검증 순서 (PR 전 필수):
```bash
npm run lint && npm run typecheck && npm run test && npm run build
```

## Project Structure

```
src/app/              → 페이지 + API routes (App Router)
src/components/       → React 컴포넌트 (ui/, dashboard/, trade/, tax/, simulator/)
src/lib/              → 비즈니스 로직 (prisma.ts, price-fetcher.ts, tax/, simulator/)
src/bot/              → 텔레그램 봇 (2차 마일스톤)
src/mcp/              → myFinance MCP 서버 (2차 마일스톤, AI 어드바이저용)
src/types/            → TypeScript 타입
prisma/               → schema.prisma + seed
docs/                 → 설계 문서
docs/designs/         → 승인된 UI/UX 디자인 프로토타입
docs/specs/           → 기능별 상세 스펙
```

## Architecture

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

**핵심 설계 결정:**
- PostgreSQL 선택 이유: 동시 쓰기 채널 4개(웹+봇+cron+AI). SQLite write lock 병목 회피.
- AI 어드바이저: Claude API 대신 서버 Claude Code CLI(`claude -p`) subprocess 호출. Max 플랜에 포함.
- 주가 갱신: node-cron으로 장중 10~15분, 장외 1시간 간격. PriceCache 테이블에 upsert.
- 환율: USDKRW=X 티커로 Yahoo Finance에서 함께 조회.
- 인증: Phase 1 Nginx basic auth → Phase 6 NextAuth.js PIN → Phase 15 역할 기반.
- 모바일: 웹은 "조회 전용 대시보드", 입력/알림은 텔레그램 중심.

## Key Domain Rules

- **계좌별 전략**: 세진=혼합전략(인덱스+종목별 태그), 소담=균형형(10년), 다솜=성장형(15년)
- **종목별 전략 태그**: long_hold, swing, momentum, value, watch, scalp (HoldingStrategy 모델)
- **통화 혼재**: 미국주 USD + 한국 ETF/주식 KRW. Holding에 currency, avgPriceFx, avgFxRate 필드. 환차손익은 주가분/환율분으로 분리 표시.
- **평균단가 계산 (이동평균법)**:
  - 매수: `newAvgPrice = (기존주수×기존평단 + 매수주수×매수단가) / 총주수`
  - 매수(USD): avgFxRate도 같은 방식 가중평균 재계산
  - 매도: 수량만 차감, avgPrice/avgFxRate 변동 없음
- **증여세**: 미성년 10년간 2,000만원 비과세. Deposit 모델로 추적.
- **RSU**: 카카오 RSU 2회(2026.4, 2027.4). RSUSchedule 모델로 관리.
- **금액 계산**: 원화는 정수 반올림, 달러는 소수점 2자리. 부동소수점 주의.
- **세금 계산**: 참고용. UI에 항상 면책 문구 표시.

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

## Reference Docs

- `docs/architecture.md` — API 설계, 주가 갱신 로직, 환경변수, TA 엔진
- `docs/data-model.md` — Prisma 스키마 전문, 관계도, ticker 매핑
- `docs/roadmap.md` — Phase 1~15 구현 계획 (1차/2차/3차 마일스톤)
- `docs/seed-data.md` — 보유종목 원본 데이터 (2026.03.04 기준)
- `docs/examples/dashboard-prototype.jsx` — 대시보드 프로토타입 (디자인·컬러·레이아웃 참고)
- `docs/milestone-2.md` — 텔레그램 봇 + Claude AI 어드바이저 + 모닝 브리핑
- `docs/milestone-3.md` — 순자산 + PDF 리포트 + 백테스팅 + 교육 뷰

## Phase Status

현재 Phase 1 (Foundation) 진행 중. 전체 로드맵: `docs/roadmap.md`
