# Phase 16: 가계부 강화

## 목적

매일 쓰는 가계부를 웹에서도 완전히 관리 가능하게 하고, 예산 관리/분석/반복 거래/후잉 연동을 추가한다.

## 현재 상태

- 웹: 조회만 (`/expenses` — 필터, 차트, 페이지네이션)
- API: `GET /api/transactions`만 존재. POST/PUT/DELETE 없음
- 텔레그램: 자연어 입력 완성 ("점심 12000", 카테고리 자동매칭)
- 카테고리: 웹 CRUD 완성 (`/categories`)
- 예산(Budget): DB 모델만 존재, API/UI 미구현
- 텔레그램 예산 커맨드: `/예산`, `/예산설정` 구현됨
- 예산 초과 알림: 텔레그램 알림 구현됨 (`budget-alert.ts`)

## 요구사항

### 16-A: 거래 CRUD API + 후잉 웹훅

- [ ] `POST /api/transactions` — 내역 생성
- [ ] `PUT /api/transactions/[id]` — 내역 수정
- [ ] `DELETE /api/transactions/[id]` — 내역 삭제
- [ ] 입력 검증 유틸 (`src/lib/transaction-utils.ts`)
- [ ] 후잉 웹훅 전송 유틸 (`src/lib/whooing-webhook.ts`)
  - 내역 생성 시 후잉 웹훅 URL이 설정되어 있으면 자동 전송
  - 다이렉트 방식 (entry_date, item, money, left, right, memo)
  - 카테고리 → 후잉 항목 매핑 데이터 활용
  - 전송 실패 시 로그만 남기고 거래 생성은 정상 완료 (비차단)

### 16-B: 거래 웹 UI + 네비게이션 개편

- [ ] TransactionForm — 추가/수정 폼 (슬라이드 패널, CategoryForm 패턴 참조)
  - 금액, 내용, 카테고리 선택, 날짜
  - 카테고리 type에 따라 소비/수입 자동 결정
- [ ] TransactionDeleteModal — 삭제 확인
- [ ] TransactionTable 확장 — 행별 수정/삭제 버튼
- [ ] ExpensesClient 확장 — "내역 추가" 버튼 + 리페치
- [ ] 네비게이션 구조 개편:
  - 포트폴리오: 대시보드, **종목 거래**(기존 "거래"), RSU, 배당금, 입금/증여, 스톡옵션
  - **가계부** (신규 그룹): 가계부, 카테고리
  - 분석: 세금, 시뮬레이터, 수익률 분석
  - AI & 전략: (변경 없음)
- [ ] 용어 정리: Trade → "종목 거래", Transaction → "내역"

### 16-C: 예산 API + UI

- [ ] `GET /api/budgets` — 예산 목록 (year, month 필터)
- [ ] `POST /api/budgets` — upsert (categoryId + year + month)
- [ ] `DELETE /api/budgets/[id]` — 예산 삭제
- [ ] BudgetManager — 월별 카테고리별 예산 설정
  - 카테고리 드롭다운 + 금액 입력
  - 총 예산 (categoryId=null) 설정
- [ ] BudgetProgress — 예산 대비 소비 진행률 바
  - 카테고리별 예산 vs 실제 지출
  - 초과 시 빨간색 강조
  - 전체 예산 소진율
- [ ] 월별 예산 복사 기능 (이번달 → 다음달)
- [ ] nav-config: 가계부 그룹에 "예산" 메뉴 추가

### 16-D: 가계부 분석 강화

- [ ] 전월 대비 증감 분석
  - 카테고리별 전월 대비 증감액/증감률
  - ExpenseSummary에 전월 대비 화살표 표시
- [ ] 지출 트렌드 차트 (3~6개월)
  - 카테고리별 월간 추이 라인 차트
  - 이상 지출 하이라이트 (평균 대비 150% 이상)
- [ ] 분석 API 확장 또는 기존 aggregation 활용

### 16-E: 반복 거래

- [ ] `RecurringTransaction` 모델 추가 (Prisma 마이그레이션)
  ```prisma
  model RecurringTransaction {
    id           String   @id @default(cuid())
    amount       Int
    description  String
    categoryId   String
    category     Category @relation(fields: [categoryId], references: [id])
    frequency    String   // "monthly" | "weekly" | "yearly"
    dayOfMonth   Int?     // 매월 N일 (monthly)
    dayOfWeek    Int?     // 요일 0-6 (weekly)
    monthOfYear  Int?     // 매년 N월 (yearly)
    isActive     Boolean  @default(true)
    nextRunAt    DateTime
    lastRunAt    DateTime?
    createdAt    DateTime @default(now())
  }
  ```
- [ ] cron 자동 생성 로직 (기존 node-cron 인프라 활용)
  - 매일 1회 실행, nextRunAt <= now인 항목 처리
  - Transaction 자동 생성 + nextRunAt 갱신
  - 후잉 웹훅 연동 (설정 시)
- [ ] 반복 거래 관리 웹 UI
  - `/recurring` 페이지 또는 가계부 내 탭
  - CRUD: 추가/수정/삭제/활성화 토글
  - API: `GET/POST /api/recurring`, `PUT/DELETE /api/recurring/[id]`
- [ ] nav-config: 가계부 그룹에 "반복 거래" 메뉴 추가

### 16-C2: 카테고리 그루핑

- [ ] `CategoryGroup` 모델 추가 (name, icon, sortOrder)
- [ ] `Category`에 `groupId` FK 추가
- [ ] `Budget`에 `groupId` FK 추가 (그룹별 예산 지원)
- [ ] 마이그레이션 + 기존 카테고리에 그룹 배정 데이터 마이그레이션
- [ ] CategoryGroup 웹 CRUD (그룹 관리)
- [ ] 카테고리 관리에 그룹 배정 기능
- [ ] 예산 페이지에 그룹별 예산/진행률 추가
- [ ] 가계부 페이지에 그룹별 집계 표시

그룹 매핑 (서버 DB 기준):
| 그룹 | 카테고리 |
|------|----------|
| 생활비 | 식료품, 외식, 생활용품, 커피_카드충전, 커피_음료, 간식, 의류, 미용, 장난감 |
| 공과금 | 전기요금, 가스요금, 통신비, 세금 |
| 여가 | 여행_숙박, 여행_교통, 여행_식사, 여행_기타, 전시및관람 |
| 교육 | 도서, 온라인강의, 학비, 학원 |
| 주거 | 관리비, 쓰레기처리비용 |
| 의료/건강 | 약국, 병원, 건강보조 |
| 금융 | 보험, 이자, 연회비 |
| 앱결제 | 앱결제_구독료, 앱결제_비정기 |
| 교통 | 차량정비, 주유, 주차, 대중교통, 세차 |
| 기타 | 기부_정기후원, 세진물품, 선물, 경조사 |

수입 카테고리(정기수입, 비정기수입)는 그룹 미배정 (groupId=null).

### 16-F: 가계부 자산 연동

- [ ] Transaction 모델에 `type`(transfer_out/transfer_in), `linkedAssetId` 추가
- [ ] 거래 유형 확장: expense | income | transfer_out | transfer_in
  - `transfer_out` + linkedAssetId → 거래 생성 시 Asset.value -= amount
  - `transfer_in` + linkedAssetId → 거래 생성 시 Asset.value += amount
- [ ] 거래 수정 시 이전 자산 효과 역산 후 새 효과 적용
- [ ] 거래 삭제 시 자산 효과 역산
- [ ] TransactionForm에 유형 선택 (소비/수입/출금/입금) + 자산 select
- [ ] 가계부 테이블에 transfer 유형 표시
- [ ] 후잉 전송 시 transfer 유형 매핑:
  - transfer_out: left=카테고리, right=자산명
  - transfer_in: left=자산명, right=결제수단
  - 완벽하지 않을 수 있으므로 후잉에서 수정 전제

사용 시나리오:
- 대출 원리금 상환: 이자 5만(expense/금융) + 원금 45만(transfer_out/대출자산)
- 적금 납입: 30만(transfer_in/적금자산)
- 보험 납입: 10만(transfer_in/저축성보험자산)

## 용어 정리

| 모델 | 현재 UI | 변경 후 UI | 비고 |
|------|---------|-----------|------|
| Trade | 거래 | **종목 거래** | nav, 페이지 타이틀 등 |
| Transaction | 거래 내역 | **내역** | 가계부 내역, 내역 추가 등 |

## 네비게이션 최종 구조

```
📊 포트폴리오
  대시보드 / 종목 거래 / RSU / 배당금 / 입금·증여 / 스톡옵션

💸 가계부
  가계부 / 카테고리 / 예산(16-C) / 반복 거래(16-E)

📈 분석
  세금 / 시뮬레이터 / 수익률 분석

🤖 AI & 전략
  AI 분석 / 순자산 / 분기 리포트 / 백테스팅
```

## 변경 파일

### 16-A
```
신규:
  src/app/api/transactions/[id]/route.ts    — PUT, DELETE
  src/lib/transaction-utils.ts              — 입력 검증
  src/lib/whooing-webhook.ts                — 후잉 웹훅 전송

수정:
  src/app/api/transactions/route.ts         — POST 추가
```

### 16-B
```
신규:
  src/components/expense/TransactionForm.tsx
  src/components/expense/TransactionDeleteModal.tsx

수정:
  src/components/expense/TransactionTable.tsx  — 수정/삭제 버튼
  src/app/expenses/ExpensesClient.tsx          — 추가 버튼, 리페치
  src/components/layout/nav-config.ts          — 구조 개편 + 용어
```

### 16-C
```
신규:
  src/app/api/budgets/route.ts
  src/app/api/budgets/[id]/route.ts
  src/lib/budget-utils.ts
  src/components/expense/BudgetManager.tsx
  src/components/expense/BudgetProgress.tsx
  src/app/budgets/page.tsx                     — 예산 페이지
```

### 16-D
```
신규:
  src/components/expense/MonthCompare.tsx       — 전월 대비 분석
  src/components/expense/SpendingTrend.tsx      — 지출 트렌드 차트

수정:
  src/app/api/transactions/route.ts            — 분석 데이터 확장
  src/app/expenses/ExpensesClient.tsx          — 분석 섹션 추가
  src/app/expenses/page.tsx                    — 분석 데이터 fetch
```

### 16-E
```
신규:
  prisma/migrations/xxx_recurring_transaction/ — 마이그레이션
  src/app/api/recurring/route.ts
  src/app/api/recurring/[id]/route.ts
  src/app/recurring/page.tsx
  src/components/expense/RecurringForm.tsx
  src/components/expense/RecurringTable.tsx
  src/lib/recurring-utils.ts
  src/cron/recurring-runner.ts                 — cron 자동 생성

수정:
  prisma/schema.prisma                         — RecurringTransaction 모델
  src/components/layout/nav-config.ts          — 반복 거래 메뉴
```

## 참조 패턴

- `src/components/category/CategoryClient.tsx` — CRUD 패턴 (Form + Table + DeleteModal)
- `src/components/category/CategoryForm.tsx` — 슬라이드 패널 폼
- `src/components/category/CategoryDeleteModal.tsx` — 삭제 확인 모달
- `src/bot/commands/expense.ts` — 거래 생성 로직
- `src/bot/commands/budget.ts` — 예산 조회/설정 로직
- `src/bot/notifications/budget-alert.ts` — 예산 알림 로직

## 벤치마크 참조

- **YNAB**: 카테고리별 예산, 예산 유연성 (재배분)
- **뱅크샐러드**: 예산 초과 알림, 전월 대비 분석
- **후잉**: 웹훅 원격입력 연동, 월별 예산 비교
- **Mint**: 패턴 기반 자동 예산 제안 (향후 검토)

## 테스트 계획

- [ ] 거래 CRUD: 생성/수정/삭제 API + 검증 에러 케이스
- [ ] 후잉 웹훅: 전송 성공/실패/미설정 시 동작
- [ ] 예산: upsert 동작, 진행률 계산, 월 복사
- [ ] 분석: 전월 대비 계산, 트렌드 데이터
- [ ] 반복 거래: cron 실행, nextRunAt 갱신, 비활성 건 스킵
- [ ] 네비게이션: 메뉴 구조 변경 + 용어 변경 확인
- [ ] 수동 검증: 웹에서 내역 추가/수정/삭제, 예산 설정/진행률

## 제외 사항

- 마이데이터/은행 연동
- OCR 영수증 입력
- 복식부기
- 제로 기반 예산 (YNAB 봉투 방식)
- 다중 통화 가계부
