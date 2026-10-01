# [Phase 1] 프로젝트 초기화 + DB + 시드

## 목적

Next.js 14 프로젝트를 생성하고, PostgreSQL + Prisma 기반 DB를 구성한 뒤, 3개 계좌의 보유종목 시드 데이터를 입력한다. Phase 1 전체의 백엔드 기반이 되는 작업.

## 요구사항

### 프로젝트 초기화
- [ ] Next.js 14 (App Router) + TypeScript + Tailwind CSS 프로젝트 생성
- [ ] ESLint 설정 (Next.js 기본 + strict TypeScript)
- [ ] 경로 alias 설정 (`@/` → `src/`)
- [ ] `.gitignore` 정리 (node_modules, .env, .next, prisma/*.db)

### Prisma + PostgreSQL
- [ ] Prisma 설치 + 초기화 (`prisma init`)
- [ ] Phase 1 스키마 작성 (Account, Holding, Trade, Deposit, PriceCache, RSUSchedule)
- [ ] 초기 마이그레이션 생성 + 적용
- [ ] Prisma Client singleton (`src/lib/prisma.ts`)

### 시드 스크립트
- [ ] `prisma/seed.ts` 작성
- [ ] 3개 계좌 생성 (세진/소담/다솜, 전략+투자기간 포함)
- [ ] 세진 보유종목 7개 시드 (AAPL, MSFT, NVDA, RKLB, 카카오, 두산로보틱스, 컨텍)
- [ ] 소담 보유종목 5개 시드 (AAPL, XAR, SOL배당다우, SOL배당혼합50, TIGER S&P500)
- [ ] 다솜 보유종목 5개 시드 (AAPL, XAR, RKLB, TIGER S&P500, SOL배당다우)
- [ ] RSU 스케줄 2건 시드 (2026.4, 2027.4)
- [ ] 증여 기록 시드 (소담 ~740만원, 다솜 ~278만원)
- [ ] USD 종목 avgFxRate: 시드 시 고정값(예: 1,450원) 사용, 이후 매매부터 정확 추적
- [ ] `package.json`에 prisma seed 스크립트 등록

### 환경 변수
- [ ] `.env.example` 생성 (DATABASE_URL, BASE_URL)
- [ ] `.env`는 `.gitignore`에 포함 확인

### 기본 API routes (대시보드 연동용)
- [ ] `GET /api/accounts` — 계좌 목록 (holdings count 포함)
- [ ] `GET /api/accounts/[id]` — 계좌 상세 (holdings 포함)

## 기술 설계

### Phase 1 Prisma 스키마

`docs/data-model.md`의 6개 모델 사용:
- Account, Holding, Trade, Deposit, PriceCache, RSUSchedule
- 2차/3차 마일스톤 모델(HoldingStrategy, Transaction 등)은 해당 Phase 마이그레이션에서 추가

### Prisma Client Singleton

```typescript
// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

### 시드 데이터 소스

`docs/seed-data.md` 참조. 주요 포인트:
- USD 종목의 `avgPrice`(KRW): `avgPriceFx × avgFxRate`로 계산
- avgFxRate 초기값: 시드 시 고정 환율 사용 (정확한 매수시점 환율 불명)
- 소담/다솜 잔여 예수금은 Phase 1에서 별도 모델 없음 (메모 용도)

### 디렉토리 구조 (이 이슈에서 생성)

```
src/
├── app/
│   ├── layout.tsx          → 루트 레이아웃 (최소)
│   ├── page.tsx            → 홈 (→ 대시보드 리다이렉트, 이슈 2)
│   └── api/
│       └── accounts/
│           ├── route.ts    → GET /api/accounts
│           └── [id]/
│               └── route.ts → GET /api/accounts/[id]
├── lib/
│   └── prisma.ts           → Prisma singleton
└── types/
    └── index.ts            → 공통 타입 (선택)
prisma/
├── schema.prisma
└── seed.ts
.env.example
```

## 테스트 계획

- [ ] `npx prisma migrate dev` 성공
- [ ] `npx prisma db seed` 성공 — 3계좌 + 17종목 + RSU 2건 + 증여 기록 생성 확인
- [ ] `npx prisma studio`에서 데이터 확인
- [ ] `GET /api/accounts` — 3개 계좌 반환
- [ ] `GET /api/accounts/[id]` — holdings 포함 반환
- [ ] `npm run lint` 통과
- [ ] `npm run build` 통과

## 제외 사항

- 실시간 주가/환율 (Phase 2)
- 거래 입력 API (Phase 3)
- UI 레이아웃/대시보드 (이슈 2)
- 배포 설정 (이슈 3)
