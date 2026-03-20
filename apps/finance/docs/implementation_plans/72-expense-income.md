# Phase 8: 소비/수입 관리 — 구현 계획 (사후 기록)

## 서브 이슈
- #73: 8-A DB 스키마 + 기본 카테고리 시드
- #74: 8-B 카테고리 웹 관리 (CRUD)
- #75: 8-C 텔레그램 자연어 입력 + 카테고리 자동 추천
- #76: 8-D /소비, /수입, /예산 커맨드
- #77: 8-E 웹 대시보드 소비/수입 차트

## 주요 변경 파일
```
신규:
  prisma/migrations/ — Category, Transaction, Budget 모델
  src/app/api/categories/ — CRUD API
  src/app/api/transactions/ — GET API
  src/app/categories/ — 카테고리 관리 페이지
  src/app/expenses/ — 가계부 페이지
  src/components/category/ — CategoryClient, Form, Table, EditPanel, DeleteModal
  src/components/expense/ — ExpenseSummary, MonthlyChart, CategoryPieChart, TransactionTable
  src/lib/category-utils.ts — 검증, slug 생성
  src/lib/expense-parser.ts — 자연어 파싱
  src/lib/category-matcher.ts — 키워드 매칭
  src/bot/commands/expense.ts — 텔레그램 소비/수입 입력
  src/bot/commands/budget.ts — 예산 커맨드
```

## DB 마이그레이션
- Category, Transaction, Budget 모델 추가

## 구현 순서
1. Category, Transaction, Budget 스키마 + 마이그레이션 + 기본 카테고리 시드
2. 카테고리 웹 CRUD (API + UI)
3. 텔레그램 자연어 파싱 + 카테고리 자동 매칭 + InlineKeyboard
4. /소비, /수입, /예산 텔레그램 커맨드
5. 웹 가계부 페이지 (요약 카드 + 월별 차트 + 파이차트 + 테이블)
