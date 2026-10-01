# 구현 계획 — Issue #7 실시간 주가 + 대시보드 업그레이드

## 변경 파일 목록

### 신규 생성
| 파일 | 설명 |
|------|------|
| `src/lib/price-fetcher.ts` | yahoo-finance2 주가/환율 조회 + PriceCache upsert |
| `src/lib/cron.ts` | node-cron 스케줄러 (장중/장외 분기) |
| `src/instrumentation.ts` | Next.js 서버 시작 시 cron 등록 |
| `src/app/api/prices/route.ts` | GET — PriceCache 전체 반환 |
| `src/app/api/prices/refresh/route.ts` | POST — 수동 갱신 트리거 |
| `src/components/dashboard/RefreshButton.tsx` | 새로고침 버튼 (client component) |
| `src/components/dashboard/FxBanner.tsx` | USD/KRW 환율 배너 |

### 수정
| 파일 | 변경 내용 |
|------|----------|
| `package.json` | yahoo-finance2, node-cron 추가 |
| `next.config.mjs` | `instrumentationHook: true` 추가 |
| `src/lib/format.ts` | formatPercent, calcCurrentValueKRW, calcProfitLoss 함수 추가 |
| `src/app/page.tsx` | PriceCache 조회, 평가금/수익률 계산, FxBanner 추가 |
| `src/app/accounts/[id]/page.tsx` | PriceCache 조회, stats 4열, 환차손익 |
| `src/components/dashboard/FamilyTotalCard.tsx` | 평가금+수익률+손익금 표시 |
| `src/components/dashboard/AccountSummaryCard.tsx` | 평가금+수익률+일일변동 표시 |
| `src/components/dashboard/HoldingsTable.tsx` | 현재가/평가금/수익률 컬럼, 환차손익 |
| `src/components/dashboard/AllocationChart.tsx` | 매입금 → 평가금 기준 비중 |
| `src/components/layout/Header.tsx` | 갱신 시각 + 새로고침 버튼 slot |

### DB 마이그레이션
없음 (PriceCache 모델은 이미 schema.prisma에 포함)

## 구현 순서

### Step 1: 패키지 설치 + 설정
```bash
npm install yahoo-finance2 node-cron
npm install -D @types/node-cron
```
- `next.config.mjs`에 `experimental.instrumentationHook: true` 추가

### Step 2: price-fetcher.ts (핵심 엔진)
- Holding 테이블에서 고유 ticker 조회
- `USDKRW=X` 추가
- yahoo-finance2 `quote()` 호출 (개별 try-catch)
- PriceCache upsert
- 결과 반환 (성공/실패 ticker 카운트)

### Step 3: cron.ts + instrumentation.ts
- `schedulePriceUpdates()`: 매 10분 실행
- 핸들러에서 장중/장외 판단 → 장중이면 실행, 장외는 정각만
- `instrumentation.ts`에서 cron 등록

### Step 4: API routes
- `GET /api/prices`: PriceCache findMany + 마지막 updatedAt
- `POST /api/prices/refresh`: refreshPrices() 호출 + 결과 반환

### Step 5: format.ts 확장
- `formatPercent(value)`: "+8.5%" / "-12.0%"
- `calcCurrentValueKRW(holding, currentPrice, fxRate)`: 평가금 계산
- `calcProfitLoss(holding, currentPrice, fxRate)`: { totalPL, pricePL, fxPL, returnPct }

### Step 6: 대시보드 메인 페이지 업그레이드
- `page.tsx`: PriceCache 조회, priceMap 생성, fxRate 추출
- FamilyTotalCard: 평가금 + 수익률 + 손익금 props 추가
- AccountSummaryCard: 평가금 + 수익률 + 일일변동 props 추가
- FxBanner 컴포넌트 추가
- Header badge "Phase 1 · 매입 데이터 기준" 제거

### Step 7: 계좌 상세 페이지 업그레이드
- `[id]/page.tsx`: PriceCache 조회, stats 4열 (평가금/수익률/오늘변동/환차손익)
- HoldingsTable: 현재가/평가금/수익률 컬럼, USD 환차손익 분리
- AllocationChart: 매입금 → 평가금 기준
- FxBanner 추가

### Step 8: Header + RefreshButton
- Header: children slot 추가 (갱신 시각 + 버튼)
- RefreshButton: POST /api/prices/refresh 호출, 스피너 애니메이션, router.refresh()

## PriceCache가 비어있을 때 (Fallback)

서버 첫 배포 시 PriceCache가 비어있음. 이 경우:
- 가격 정보 없는 종목은 매입금 기준으로 표시
- "주가 정보를 불러오는 중..." 안내 메시지
- 수익률/환차손익 컬럼은 "—" 표시

## 디자인 참조

`docs/designs/7-live-prices/prototype.html` — 승인된 프로토타입
