# Phase 17: 설정/관리 페이지 (Admin Center)

## 목적

하드코딩된 데이터를 웹에서 관리. DB 직접 수정 불필요한 자급자족 시스템 구축.

## 현재 상태

| 엔티티 | 웹 API | 웹 UI | 텔레그램 | 비고 |
|--------|--------|-------|---------|------|
| Account | GET만 | 조회만 | - | 이름/전략/기간 수정 불가 |
| RSUSchedule | GET + vest | 조회+베스팅 | - | 추가/수정/삭제 불가 |
| StockOption | GET만 | 조회만 | - | CRUD 불가 |
| Watchlist | - | - | CRUD | 웹 API/UI 없음 |
| AlertConfig | GET+PUT | - | - | 웹 UI 없음 |
| IncomeProfile | CRUD | - | - | 전용 UI 없음 (세금 시뮬레이터 내장) |

## 요구사항

### 17-A: 계좌 관리

- [ ] `PATCH /api/accounts/[id]` — 수정 (name, strategy, horizon, benchmarkTicker, ownerAge)
  - 계좌 생성/삭제는 제외 (드물고 연쇄 삭제 위험)
- [ ] AccountEditor 컴포넌트
  - 계좌별 설정 카드 (이름, 전략, 투자기간, 벤치마크, 나이)
  - 인라인 편집 또는 모달 방식

### 17-B: RSU 스케줄 관리

- [ ] `POST /api/rsu` — 스케줄 추가
- [ ] `PUT /api/rsu/[id]` — 수정 (vestingDate, shares, basisValue, note 등)
- [ ] `DELETE /api/rsu/[id]` — 삭제 (pending 상태만)
- [ ] RSU 페이지에 CRUD UI 추가
  - 추가 버튼 + 슬라이드 폼
  - 행별 수정/삭제 버튼
  - vested 상태는 수정/삭제 비활성화

### 17-C: 스톡옵션 관리

- [ ] `POST /api/stock-options` — 스톡옵션 추가
- [ ] `PUT /api/stock-options/[id]` — 수정
- [ ] `DELETE /api/stock-options/[id]` — 삭제
- [ ] `POST /api/stock-options/[id]/vestings` — 행사 스케줄 추가
- [ ] `PUT /api/stock-options/[id]/vestings/[vid]` — 행사 스케줄 수정
- [ ] `DELETE /api/stock-options/[id]/vestings/[vid]` — 행사 스케줄 삭제
- [ ] 스톡옵션 페이지에 CRUD UI 추가
  - 옵션 추가/수정/삭제
  - 행사 스케줄(vestings) 인라인 관리

### 17-D: 관심종목 웹 관리

- [ ] `GET /api/watchlist` — 전체 조회 (현재가 포함)
- [ ] `POST /api/watchlist` — 추가
- [ ] `PUT /api/watchlist/[id]` — 수정
- [ ] `DELETE /api/watchlist/[id]` — 삭제
- [ ] `/watchlist` 웹 페이지
  - 관심종목 테이블 (종목명, 현재가, 전략, 목표 매수가, 매수구간, 메모)
  - PriceCache 활용 현재가 표시
  - 추가/수정/삭제 UI
- [ ] nav-config: 포트폴리오 그룹에 "관심종목" 메뉴 추가

### 17-E: 설정 통합 페이지

- [ ] `/settings` 통합 페이지 (탭 구조)
  - **계좌** 탭: AccountEditor (17-A)
  - **알림** 탭: AlertConfigEditor — 기존 PUT API 활용
  - **근로소득** 탭: IncomeProfileManager — 기존 CRUD API 활용
  - **후잉 연동** 탭: 웹훅 URL 설정, 카테고리-후잉항목 매핑
- [ ] nav-config: 최하단 "설정" 그룹 추가

## 후잉 연동 설정 상세

### DB 모델 (신규)

```prisma
model WhooingConfig {
  id          String  @id @default(cuid())
  webhookUrl  String? // 후잉 웹훅 URL (null이면 비활성)
  isActive    Boolean @default(false)
  defaultRight String? // 기본 결제수단 (후잉 right 항목)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model WhooingCategoryMap {
  id          String   @id @default(cuid())
  categoryId  String   @unique
  category    Category @relation(fields: [categoryId], references: [id])
  whooingLeft String   // 후잉 left 항목 (예: "식료품", "교통비")
  whooingRight String? // 후잉 right 항목 (null이면 기본값 사용)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### API

- [ ] `GET /api/settings/whooing` — 설정 조회
- [ ] `PUT /api/settings/whooing` — 설정 변경 (webhookUrl, isActive, defaultRight)
- [ ] `GET /api/settings/whooing/mappings` — 카테고리 매핑 목록
- [ ] `PUT /api/settings/whooing/mappings` — 매핑 일괄 저장

## 네비게이션 최종 구조 (Phase 17 완료 후)

```
📊 포트폴리오
  대시보드 / 종목 거래 / RSU / 배당금 / 입금·증여 / 스톡옵션 / 관심종목

💸 가계부
  가계부 / 카테고리 / 예산 / 반복 거래

📈 분석
  세금 / 시뮬레이터 / 수익률 분석

🤖 AI & 전략
  AI 분석 / 순자산 / 분기 리포트 / 백테스팅

⚙️ 설정
  계좌 / 알림 / 근로소득 / 후잉 연동
```

## 변경 파일

### 17-A
```
수정:
  src/app/api/accounts/[id]/route.ts        — PATCH 추가
신규:
  src/components/settings/AccountEditor.tsx
```

### 17-B
```
신규:
  src/app/api/rsu/route.ts                  — POST 추가
  src/app/api/rsu/[id]/route.ts             — PUT, DELETE
  src/components/rsu/RSUForm.tsx
  src/components/rsu/RSUDeleteModal.tsx
수정:
  src/components/rsu/ 관련 테이블            — CRUD 버튼
```

### 17-C
```
신규:
  src/app/api/stock-options/route.ts                    — POST 추가
  src/app/api/stock-options/[id]/route.ts               — PUT, DELETE
  src/app/api/stock-options/[id]/vestings/route.ts      — POST
  src/app/api/stock-options/[id]/vestings/[vid]/route.ts — PUT, DELETE
  src/components/stock-option/StockOptionForm.tsx
  src/components/stock-option/VestingForm.tsx
수정:
  src/components/stock-option/ 관련 테이블              — CRUD 버튼
```

### 17-D
```
신규:
  src/app/api/watchlist/route.ts
  src/app/api/watchlist/[id]/route.ts
  src/app/watchlist/page.tsx
  src/components/watchlist/WatchlistClient.tsx
  src/components/watchlist/WatchlistTable.tsx
  src/components/watchlist/WatchlistForm.tsx
수정:
  src/components/layout/nav-config.ts       — 관심종목 메뉴
```

### 17-E
```
신규:
  src/app/settings/page.tsx
  src/components/settings/SettingsClient.tsx
  src/components/settings/AlertConfigEditor.tsx
  src/components/settings/IncomeProfileManager.tsx
  src/components/settings/WhooingSettings.tsx
  src/app/api/settings/whooing/route.ts
  src/app/api/settings/whooing/mappings/route.ts
수정:
  src/components/layout/nav-config.ts       — 설정 메뉴
  prisma/schema.prisma                      — WhooingConfig, WhooingCategoryMap 모델
```

## 참조 패턴

- `src/app/api/income-profiles/` — 완전한 CRUD API 패턴 (IncomeProfile)
- `src/components/category/` — CRUD UI 패턴 (Form + Table + DeleteModal)
- `src/bot/commands/watchlist.ts` — 관심종목 생성/수정/삭제 로직
- `src/app/api/alerts/config/route.ts` — AlertConfig GET/PUT 패턴

## 테스트 계획

- [ ] Account PATCH: 필드별 수정, 유효성 검증
- [ ] RSU CRUD: 생성/수정/삭제, vested 상태 삭제 방지
- [ ] StockOption CRUD: 옵션 + 베스팅 연쇄 CRUD
- [ ] Watchlist CRUD: 웹 API + 기존 텔레그램 커맨드 병행 확인
- [ ] AlertConfig: 기존 API 활용 UI 동작
- [ ] IncomeProfile: 기존 API 활용 UI 동작
- [ ] WhooingConfig: 설정 저장/조회, 매핑 일괄 저장
- [ ] 네비게이션: 관심종목 + 설정 메뉴 추가 확인

## 제외 사항

- 계좌 생성/삭제 (드물고 Holding 등 연쇄 삭제 위험)
- 세금 상수 웹 관리 (법 개정 빈도 낮음, 코드 수정으로 충분)
- AlertConfig 키 추가/삭제 (DB seed로 관리)
