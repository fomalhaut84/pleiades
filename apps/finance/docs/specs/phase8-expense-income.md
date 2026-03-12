# Phase 8: 소비/수입 관리

## 목적

가족 가계부 기능. 텔레그램에서 자연어로 간편 입력하고, 웹에서 카테고리 관리와 시각화를 제공한다.

## 요구사항

### 핵심

- [ ] Transaction, Category, Budget DB 스키마
- [ ] 카테고리 웹 CRUD (추가/수정/삭제)
- [ ] 텔레그램 자연어 입력 ("점심 12000", "택시 4500", "월급 5000000")
- [ ] 입력 시 카테고리 자동 추천 (키워드 매칭 규칙)
- [ ] /소비, /수입 — 월별/카테고리별 조회
- [ ] /예산 — 월 예산 설정 및 잔여 확인 (옵셔널)
- [ ] 웹 대시보드 소비/수입 차트

### 설계 원칙

- **자연어 우선**: 텔레그램에서 `점심 12000`만 입력하면 소비 기록 + 카테고리 자동 분류
- **카테고리 관리는 웹**: 카테고리 목록/키워드 매핑을 웹에서 편집
- **예산은 옵셔널**: Budget 모델은 있지만, 설정하지 않아도 소비/수입 기록은 정상 동작
- **가족 확장 대비**: userId(텔레그램 chatId) 기반으로 기록자 추적. 현재는 단일 사용자

## DB 스키마

```prisma
model Category {
  id           String        @id @default(cuid())
  name         String        @unique  // "식비", "교통", "월급" 등
  type         String        // "expense" | "income"
  icon         String?       // 이모지 아이콘
  keywords     String[]      // 자동 분류 키워드 ["점심", "저녁", "커피", "배달"]
  sortOrder    Int           @default(0)
  createdAt    DateTime      @default(now())
  transactions Transaction[]
  budgets      Budget[]
}

model Transaction {
  id          String   @id @default(cuid())
  type        String   // "expense" | "income"
  amount      Int      // 원화 정수
  description String   // 사용자 입력 원문 ("점심")
  categoryId  String
  category    Category @relation(fields: [categoryId], references: [id])
  userId      String?  // 텔레그램 userId (가족 확장 대비)
  transactedAt DateTime @default(now()) // 거래 시각
  createdAt   DateTime @default(now())

  @@index([type, transactedAt])
  @@index([categoryId])
  @@index([userId])
}

model Budget {
  id         String   @id @default(cuid())
  categoryId String?  // null이면 전체 예산
  category   Category? @relation(fields: [categoryId], references: [id])
  year       Int
  month      Int
  amount     Int      // 월 예산 (원)
  createdAt  DateTime @default(now())

  @@unique([categoryId, year, month])
}
```

## 카테고리 자동 추천 로직

1. 사용자 입력에서 설명과 금액 파싱: `"점심 12000"` → description="점심", amount=12000
2. Category.keywords 배열에서 description과 매칭 (부분 일치)
3. 매칭 결과:
   - 1개 매칭 → 자동 분류
   - 다중 매칭 → InlineKeyboard로 선택
   - 미매칭 → InlineKeyboard로 카테고리 선택
4. 카테고리 확정 후 Transaction 생성

### 자연어 파싱 규칙

```
입력: "{설명} {금액}"  또는  "{금액} {설명}"
- 금액: 숫자 (콤마 허용). 예: 12000, 12,000, 5000000
- 설명: 나머지 텍스트
- 금액이 없으면 에러

수입/소비 구분:
- 기본값: 소비 (expense)
- 수입 키워드 매칭 시: 수입 (income)
- 또는 명시적 prefix: "수입 월급 5000000"
```

## 기본 카테고리 시드

### 소비 (expense)
| 이름 | 아이콘 | 키워드 |
|------|--------|--------|
| 식비 | 🍚 | 점심, 저녁, 아침, 커피, 카페, 배달, 식사, 간식, 음료 |
| 교통 | 🚗 | 택시, 버스, 지하철, 주유, 기름, 톨비, 주차 |
| 생활 | 🏠 | 마트, 생필품, 세탁, 관리비, 공과금, 전기, 수도, 가스 |
| 의료 | 🏥 | 병원, 약국, 치과, 안과, 건강검진 |
| 교육 | 📚 | 학원, 교재, 학비, 수업, 강의 |
| 쇼핑 | 🛍️ | 쇼핑, 옷, 신발, 가전, 전자기기 |
| 여가 | 🎮 | 영화, 게임, 여행, 숙소, 운동, 헬스 |
| 경조사 | 💐 | 축의금, 조의금, 선물, 생일 |
| 기타 | 📦 | (fallback) |

### 수입 (income)
| 이름 | 아이콘 | 키워드 |
|------|--------|--------|
| 월급 | 💰 | 월급, 급여, 보너스, 상여 |
| 부수입 | 💵 | 부수입, 알바, 프리랜서, 용돈 |
| 기타수입 | 📥 | (fallback) |

## 서브 이슈

### 8-A: DB 스키마 + 기본 카테고리 시드
- Category, Transaction, Budget 모델 추가
- 마이그레이션
- 기본 카테고리 시드 (위 테이블)

### 8-B: 카테고리 웹 관리
- `/categories` 페이지
- 카테고리 CRUD (이름, 타입, 아이콘, 키워드 편집)
- API: GET/POST/PUT/DELETE `/api/categories`

### 8-C: 텔레그램 자연어 입력 + 카테고리 자동 추천
- 자연어 파싱 ("점심 12000")
- 키워드 기반 카테고리 추천
- InlineKeyboard 확인/카테고리 선택
- Transaction 생성

### 8-D: /소비, /수입, /예산 커맨드
- /소비 — 이번 달 소비 요약 (카테고리별)
- /수입 — 이번 달 수입 요약
- /예산 — 월 예산 설정 및 잔여 확인
- /예산설정 {금액} — 월 전체 예산 설정

### 8-E: 웹 대시보드 소비/수입 차트
- `/expenses` 페이지
- 월별 소비/수입 추이 (BarChart)
- 카테고리별 비율 (PieChart)
- 최근 거래 내역 목록

## 제외 사항
- 영수증 OCR
- 은행 연동 자동 입력
- 다중 통화 (원화만)
