# 16-E: 반복 거래 — 구현 계획

## 변경 파일 목록

### 신규
- `prisma/migrations/xxx_recurring_transaction/` — 마이그레이션
- `src/app/api/recurring/route.ts` — GET, POST
- `src/app/api/recurring/[id]/route.ts` — PUT, DELETE, PATCH (활성 토글)
- `src/app/recurring/page.tsx` — 반복 거래 페이지
- `src/app/recurring/RecurringClient.tsx` — 클라이언트 컴포넌트
- `src/components/expense/RecurringForm.tsx` — 추가/수정 슬라이드 패널
- `src/components/expense/RecurringTable.tsx` — 반복 거래 테이블
- `src/components/expense/RecurringDeleteModal.tsx` — 삭제 확인 모달
- `src/lib/recurring-utils.ts` — 검증, nextRunAt 계산

### 수정
- `prisma/schema.prisma` — RecurringTransaction 모델
- `src/lib/cron.ts` — 반복 거래 실행 스케줄러 등록
- `src/components/layout/nav-config.ts` — 가계부 그룹에 "반복 거래" 추가
- `src/instrumentation.ts` — cron 등록

## 패키지 추가
없음

## DB 마이그레이션
- RecurringTransaction 모델 신규

## 디자인 참조
- `docs/designs/177-recurring/prototype.html` (승인 완료)

## 구현 순서

### Step 1: Prisma 스키마 + 마이그레이션
- RecurringTransaction 모델: amount, description, categoryId, frequency, dayOfMonth, dayOfWeek, monthOfYear, isActive, nextRunAt, lastRunAt

### Step 2: recurring-utils.ts
- validateRecurringInput(): 검증
- calculateNextRunAt(): frequency + day 기반 다음 실행일 계산

### Step 3: Recurring CRUD API
- GET /api/recurring: 목록 (카테고리 포함, nextRunAt 오름차순)
- POST /api/recurring: 생성 (검증 + nextRunAt 계산)
- PUT /api/recurring/[id]: 수정
- DELETE /api/recurring/[id]: 삭제
- PATCH /api/recurring/[id]: 활성 토글 (isActive)

### Step 4: Cron 실행 로직
- 매일 00:05 KST 실행
- isActive=true AND nextRunAt <= now 조건
- Transaction 생성 + nextRunAt 갱신
- 후잉 웹훅 연동 (설정 시)
- createCronGuard 패턴 재사용

### Step 5: UI 컴포넌트
- RecurringTable: 테이블 + 활성 토글 + 수정/삭제 버튼
- RecurringForm: 슬라이드 패널 (주기 세그먼트 + 실행일 동적 변경)
- RecurringDeleteModal: 삭제 확인
- RecurringClient: 상태 관리 + API 호출
- page.tsx: 서버 컴포넌트

### Step 6: nav-config + cron 등록
- 가계부 그룹에 "반복 거래" 메뉴 추가
- instrumentation.ts에 scheduleRecurring() 등록
