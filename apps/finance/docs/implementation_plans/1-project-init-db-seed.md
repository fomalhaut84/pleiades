# 구현 계획: #1 프로젝트 초기화 + DB + 시드

## 패키지

```bash
# create-next-app으로 생성 (내장: typescript, tailwindcss, eslint)
npx create-next-app@14 . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"

# 추가 설치
npm install prisma --save-dev
npm install @prisma/client
npm install tsx --save-dev          # seed 스크립트 실행용
```

## DB 마이그레이션

- Phase 1 모델 6개: Account, Holding, Trade, Deposit, PriceCache, RSUSchedule
- `npx prisma migrate dev --name init`

## 구현 순서

| 순서 | 파일 | 설명 |
|------|------|------|
| 1 | `create-next-app` 실행 | 프로젝트 골격 생성 |
| 2 | `prisma/schema.prisma` | Phase 1 모델 6개 작성 |
| 3 | 마이그레이션 실행 | `prisma migrate dev --name init` |
| 4 | `src/lib/prisma.ts` | Prisma Client singleton |
| 5 | `prisma/seed.ts` | 3계좌 + 17종목 + RSU + 증여 시드 |
| 6 | `package.json` | prisma seed 스크립트 등록 |
| 7 | `src/app/api/accounts/route.ts` | GET /api/accounts |
| 8 | `src/app/api/accounts/[id]/route.ts` | GET /api/accounts/[id] |
| 9 | `.env.example` | 환경변수 템플릿 |
| 10 | 검증 | lint + build + seed + API 테스트 |

## 시드 데이터 포인트

- USD 종목 `avgFxRate`: **1,450원** 고정 (시드 초기값)
- USD 종목 `avgPrice`(KRW) = `avgPriceFx × 1450`
- 증여 기록: 소담 2건(합계 ~740만), 다솜 2건(합계 ~278만) — 실제 이체 시점 기준 임의 분할
- 소담/다솜 잔여 예수금은 Phase 1에서 별도 모델 없음 (메모 용도)

## 변경 파일 목록

```
(신규) prisma/schema.prisma
(신규) prisma/seed.ts
(신규) src/lib/prisma.ts
(신규) src/app/api/accounts/route.ts
(신규) src/app/api/accounts/[id]/route.ts
(신규) .env.example
(수정) package.json                    — prisma seed 스크립트 추가
(수정) .gitignore                      — .env 확인
```

## 검증 체크리스트

- [ ] `npx prisma migrate dev` 성공
- [ ] `npx prisma db seed` — 3계좌 + 17종목 + RSU 2건 + 증여 기록
- [ ] `npx prisma studio`에서 데이터 확인
- [ ] `GET /api/accounts` — 3개 계좌 반환
- [ ] `GET /api/accounts/[id]` — holdings 포함 반환
- [ ] `npm run lint` 통과
- [ ] `npm run build` 통과
