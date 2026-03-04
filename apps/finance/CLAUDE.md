# myFinance — 가족 자산관리 시스템

개인 서버(Ubuntu)에서 운영하는 가족 투자 포트폴리오 관리 웹앱.
세진(본인) + 소담(9세) + 다솜(5세) 3개 계좌를 통합 관리한다.

## Tech Stack

- **Framework**: Next.js 14 (App Router, TypeScript)
- **DB**: PostgreSQL + Prisma ORM
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **Price API**: yahoo-finance2 (미국주 + 한국주/ETF + historical OHLCV)
- **TA Engine**: trading-signals (RSI, MACD, BB, SMA/EMA — 로컬 계산, Phase 11)
- **AI**: Claude Code CLI (`claude -p`, Max 플랜) — 2차 마일스톤에서 AI 어드바이저로 활용
- **Bot**: grammY (텔레그램 봇, 2차 마일스톤)
- **Deploy**: PM2 + Nginx on Ubuntu

## Commands

```bash
npm run dev          # 개발 서버 (localhost:3000)
npm run build        # 프로덕션 빌드
npm run start        # 프로덕션 실행
npx prisma studio    # DB 브라우저
npx prisma migrate dev  # 마이그레이션 생성+적용 (개발)
npx prisma migrate deploy  # 마이그레이션 적용 (프로덕션)
npx prisma db seed   # 시드 데이터 입력
npm run lint         # ESLint
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
docs/                 → 상세 설계 문서 (아키텍처, 데이터모델, 로드맵, 마일스톤)
docs/designs/         → 승인된 UI/UX 디자인 프로토타입 (워크플로우 4단계 산출물)
docs/specs/           → 기능별 상세 스펙 (워크플로우 2단계 산출물)
```

## Architecture Decisions

- PostgreSQL을 쓰는 이유: 2차 마일스톤(텔레그램 봇 + Claude AI + cron)에서 동시 쓰기 채널이 4개(웹+봇+cron+AI). SQLite의 write lock이 병목. Prisma 추상화로 스키마는 동일.
- 웹 인증: Phase 1에서 Nginx basic auth로 최소 보호, Phase 6에서 NextAuth.js PIN 인증으로 업그레이드. Phase 15(아이들 뷰) 역할 기반 접근 제어 기반.
- AI 어드바이저: Claude API 대신 서버에 설치된 Claude Code CLI(`claude -p`)를 subprocess로 호출. Max 플랜 구독에 포함되어 추가 비용 없음. Agent SDK가 Max 빌링 지원 시 전환 검토.
- 주가 갱신: node-cron으로 장중 10~15분, 장외 1시간 간격. PriceCache 테이블에 upsert. PortfolioSnapshot은 장 종료 직후 PriceCache 갱신 완료 후 실행.
- 환율: USDKRW=X 티커로 Yahoo Finance에서 함께 조회.
- 세금 계산은 참고용. 법적 조언이 아님을 UI에 항상 표시.
- 모바일 역할 분담: 모바일 웹은 "조회 전용 대시보드", 입력/알림은 텔레그램 중심.

## Key Domain Rules

- **계좌별 전략이 다르다**: 세진=혼합전략(인덱스 확대 + 종목별 장기/스윙/감시 태그), 소담=균형형(10년), 다솜=성장형(15년)
- **종목별 전략 태그**: 세진 계좌 내 종목마다 다른 전략 적용 (long_hold, swing, momentum, value, watch, scalp). HoldingStrategy 모델로 관리.
- **증여세**: 미성년 10년간 2,000만원 비과세. Deposit 모델로 추적.
- **통화 혼재**: 미국주는 USD, 한국 ETF/주식은 KRW. Holding에 currency + avgPriceFx + avgFxRate 필드. 환차손익은 주가분/환율분으로 분리 표시.
- **평균단가**: 매수 시 가중평균 재계산, 매도 시 평균단가 유지(이동평균법).
- **RSU**: 카카오 RSU 2회(2026.4, 2027.4). RSUSchedule 모델로 관리.

## Workflow

모든 기능 개발은 정해진 워크플로우를 따른다. 상세 규칙: `.claude/rules/workflow.md`

```
기획 → 문서화(docs/specs/) → GitHub 이슈 → UI/UX 디자인(frontend-design 스킬)
→ 구현 계획 → 개발 → 테스트 → 코드 리뷰(codex-cli, P1/P2=0까지)
→ PR 생성 → [사용자 머지] → 이슈 종료
```

- 브랜치: main(실서비스) → dev(개발) → feat/fix (dev에서 생성, dev로 PR)
- hotfix: main에서 생성 → main + dev 양쪽 머지
- 릴리즈: dev → main 머지 후 `v{major}.{minor}.{patch}` 태그 + GitHub 릴리즈
- 커밋: conventional commits (`feat(scope): desc (#issue)`)
- 코드 리뷰: codex-cli MCP에 프롬프트로 리뷰 요청. P1/P2 이슈 0건까지 반복.
- PR 머지는 사용자가 직접 수행. 머지 후 알려주면 이슈 정리+종료.
- `gh` CLI로 이슈/PR 생성.

## Coding Conventions

- 컴포넌트: 함수형 + hooks. default export.
- API routes: src/app/api/ 아래 route.ts. try-catch + 일관된 에러 응답.
- DB 접근: 반드시 Prisma client 통해서. raw query 금지.
- 금액 계산: 부동소수점 주의. 원화는 정수 반올림, 달러는 소수점 2자리.
- 한국어 UI, 코드/변수명은 영어.
- 커밋 메시지: conventional commits (feat:, fix:, chore:)

## Detailed Docs

상세 스펙이 필요할 때 아래 파일을 참조:
- `@docs/architecture.md` — 시스템 아키텍처, API 설계, 주가 갱신 로직
- `@docs/data-model.md` — Prisma 스키마 전문, 관계도, 시드 데이터
- `@docs/roadmap.md` — Phase 1~15 구현 계획 (1차/2차/3차 마일스톤)
- `@docs/seed-data.md` — 현재 보유종목 원본 데이터 (2026.03.04 기준)
- `@docs/examples/dashboard-prototype.jsx` — 초기 대시보드 프로토타입 (디자인·컬러·레이아웃 참고용)
- `@docs/milestone-2.md` — 2차 마일스톤 상세 (텔레그램 봇 + Claude AI 어드바이저 + 모닝 브리핑)
- `@docs/milestone-3.md` — 3차 마일스톤 상세 (순자산 + PDF 리포트 + 백테스팅 + 교육 뷰)

## Phase Status

현재 Phase 1 (Foundation) 진행 중.
전체 로드맵: `@docs/roadmap.md`