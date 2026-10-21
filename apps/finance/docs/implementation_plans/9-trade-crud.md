# Phase 3 Trade CRUD — 구현 계획

## 변경 파일 목록

### 신규
- `src/lib/trade-utils.ts` — Holding 재계산 로직
- `src/app/api/trades/route.ts` — GET/POST
- `src/app/api/trades/[id]/route.ts` — PUT/DELETE
- `src/app/trades/page.tsx` — 거래 내역 페이지
- `src/app/trades/new/page.tsx` — 새 거래 폼 페이지
- `src/components/trade/TradeTable.tsx` — 거래 테이블
- `src/components/trade/TradeForm.tsx` — 거래 입력 폼 (client)
- `src/components/trade/TradeFilters.tsx` — 필터 바 (client)
- `src/components/trade/EditPanel.tsx` — 수정 슬라이드 패널 (client)
- `src/components/trade/DeleteModal.tsx` — 삭제 확인 모달 (client)

### 수정
- `src/components/layout/Sidebar.tsx` — "거래" 메뉴 추가

## 패키지 추가
없음

## DB 마이그레이션
없음 (Trade 모델은 이미 schema.prisma에 정의됨)

## 구현 순서

### Step 1: trade-utils.ts — Holding 재계산 로직
- `recalcHolding(trades)` — Trade 배열 → { shares, avgPrice, avgPriceFx, avgFxRate }
- `calcTotalKRW(price, shares, currency, fxRate)` — 총액 계산
- BUY: 가중평균 재계산, SELL: 수량 차감
- 단위 테스트 가능하도록 순수 함수로 작성

### Step 2: POST /api/trades — 거래 생성
- Body 검증 (zod 없이 수동, 기존 패턴 유지)
- Prisma transaction: Trade 생성 + Holding upsert/delete
- BUY 신규 종목: Holding 생성
- BUY 기존 종목: 가중평균 재계산
- SELL: 수량 차감, 0주 시 삭제
- 응답: { trade, holding }

### Step 3: GET /api/trades — 거래 조회
- Query params: accountId, ticker, type, from, to, limit, offset
- tradedAt DESC 정렬
- 총 건수(total) + trades 배열

### Step 4: PUT/DELETE /api/trades/[id]
- DELETE: Trade 삭제 → recalcHolding으로 남은 거래 기준 Holding 재계산
- PUT: Trade 수정 → recalcHolding으로 전체 거래 기준 Holding 재계산
- 계좌+종목 남은 거래 0건 → Holding 삭제

### Step 5: TradeForm.tsx — 거래 입력 폼 (client component)
- 계좌 선택 (API로 계좌 목록 조회)
- BUY/SELL 토글
- 종목 드롭다운 (선택 계좌의 보유종목) + 직접 입력
- 실시간 총액 계산
- USD 종목: 환율 필드 + 현재 환율 자동 채움 (PriceCache에서)
- SELL: 보유수량 표시 + 초과 검증
- POST /api/trades 호출 → router.push('/trades')

### Step 6: 거래 내역 페이지 + TradeTable + TradeFilters
- /trades — SSR로 초기 데이터 로드
- TradeFilters: 계좌/유형 필터 (client, query params로 관리)
- TradeTable: 테이블 렌더링 + 페이지네이션
- 수정/삭제 액션 버튼

### Step 7: EditPanel + DeleteModal
- EditPanel: 우측 슬라이드, PUT /api/trades/[id] 호출
- DeleteModal: 확인 모달, DELETE /api/trades/[id] 호출
- 성공 시 router.refresh()

### Step 8: Sidebar + 새 거래 페이지
- Sidebar에 "거래" 메뉴 추가 (아이콘 + 링크)
- /trades/new — TradeForm 렌더링
