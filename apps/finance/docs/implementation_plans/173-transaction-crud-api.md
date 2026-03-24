# 16-A: 거래 CRUD API + 후잉 웹훅 — 구현 계획

## 변경 파일 목록

### 신규
- `src/lib/transaction-utils.ts` — 입력 검증 유틸
- `src/lib/whooing-webhook.ts` — 후잉 웹훅 전송 유틸
- `src/app/api/transactions/[id]/route.ts` — PUT, DELETE

### 수정
- `src/app/api/transactions/route.ts` — POST 추가

## 패키지 추가
없음

## DB 마이그레이션
없음

## 구현 순서

### Step 1: transaction-utils.ts — 입력 검증
- `validateTransactionInput(body)`: amount(양의 정수, 상한 2^31-1), description(필수, 200자), categoryId(필수), transactedAt(선택, 유효 날짜)
- category-utils.ts 패턴 동일

### Step 2: POST /api/transactions — 내역 생성
- JSON 파싱 실패 → 400 (별도 try/catch)
- 검증 → 카테고리 존재 확인 → create → 후잉 웹훅(비차단) → 201 응답
- P2003 FK 에러 → 400 매핑

### Step 3: PUT/DELETE /api/transactions/[id]
- PUT: JSON 파싱 → 검증 → 카테고리 확인 → 사전 조회(transactedAt 기본값용) → update
- DELETE: 바로 delete, P2025 catch로 404 매핑
- 공통: P2003/P2025 Prisma 에러 핸들링

### Step 4: whooing-webhook.ts — 후잉 웹훅 전송
- WHOOING_WEBHOOK_URL 환경변수 미설정 시 즉시 리턴
- POST JSON 방식 (entry_date, item, money, left, right, memo)
- KST 기준 날짜 포맷 (서버 타임존 무관)
- 5초 타임아웃, 실패 시 에러 throw (호출부에서 catch)
- Phase 17-E에서 DB 기반 설정 + 카테고리 매핑으로 고도화 예정

## 디자인
백엔드 전용 — 디자인 단계 해당 없음
