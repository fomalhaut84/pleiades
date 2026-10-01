# 16차 마일스톤 — AI 정책 강화 & 뉴스 조건 (마스터)

- **작성일**: 2026-07-10
- **타입**: 마일스톤 (마스터 스펙, sub-phase 분할)
- **참조**: 15차 마스터 #414, `memory/project_next_milestone_16.md`
- **대체**: #421 (기존 34-C 뉴스 조건 이슈는 close, Phase 36 3개 서브로 재발행)

## 1. 배경

15차 완료 후 사용자 명시 pain:
1. `/ai` 자유 질문 채널이 haiku 로 돌아 도구 체이닝·트레이드오프 서술이 얕음 (능동 리뷰·브리핑은 이미 sonnet 로 올려둔 상태와 불일관).
2. `/strategies` 는 등록 시만 자연어. 편집은 JSON 손편집 → 자연어 기반 관리 UX 결여.
3. 15차 이월된 뉴스 조건 (#421) 은 외부 API 승인 대기 상태. API 후보 확정 후 정식 착수.

## 2. 목표

16차 종료 시:
- ✅ `/ai` (텔레그램 + 웹) 이 sonnet 로 동작. 파서·짧은 가이드는 haiku 유지 (비용·응답속도 균형)
- ✅ `AdvisorOptions.intent` 로 의도 명시 → 향후 모델 정책 조정 시 한 곳에서만 관리
- ✅ `/strategies` 편집 모달에서 자연어로 조건 수정 (상대 편집 지원)
- ✅ 뉴스 조건 (`news_keyword`) 도입 → 벤치마크/어닝에 이어 v3 완결

## 3. Sub-Phase 분할

### Phase 35: AI 정책 강화

#### 35-A: `/ai` 자유대화 채널 sonnet 승격 + intent API (~반나절)

**목적**: 사용자 명시 pain 해소. 도구 체이닝·트레이드오프 서술 강화.

- [ ] `AdvisorOptions.intent?: 'conversation' | 'parse' | 'guide'` 신설
- [ ] `askAdvisor` 가 intent 기반으로 model 자동 결정 (명시 model 이 있으면 우선)
  - `conversation` → sonnet
  - `parse` / `guide` → haiku (default)
- [ ] 호출부 갱신:
  - `src/bot/commands/ai.ts` (텔레그램 `/ai`) → `intent: 'conversation'`
  - `src/app/api/ai/ask/route.ts` → `intent: 'conversation'`
  - `src/bot/commands/expense.ts` (가계부 파싱) → `intent: 'parse'`
  - `src/bot/commands/ai.ts` (거래 파싱 라인 141) → `intent: 'parse'`
  - `src/bot/notifications/ta-signal-alert.ts` (TA 가이드) → `intent: 'guide'`
  - `src/lib/custom-strategy/parser.ts` → `intent: 'parse'`
- [ ] 테스트: intent → model 매핑 pure 유닛

**노력**: XS

#### 35-B: 자연어 전략 편집 (~1일)

**목적**: 등록 뿐 아니라 편집도 자연어로 → 관리 UX 통일.

- [ ] 편집 프롬프트 (`editStrategyByNL`):
  - 입력: 기존 `CustomStrategy` (name / ticker / conditions / logic / frequency) + 자연어 지시
  - 출력: 갱신된 `ParsedStrategy` (또는 error)
- [ ] "SPY 조건 빼줘", "어닝 5일로 완화", "OR 로 바꿔" 같은 **상대 편집** 지원
- [ ] `/strategies` 편집 모달에 자연어 입력 필드 (기존 JSON 편집과 병존)
- [ ] 미리보기 UI (변경 사항 diff 표기)
- [ ] 테스트: 프롬프트 spec + evaluator 통과 여부

**노력**: S

### Phase 36: 뉴스 조건 (v3 완결)

#### 36-A: 뉴스 API 도입 결정 (스펙) (~반나절)

**목적**: 후보 API 비교 → 사용자 승인 획득 → 아래 단계 진행 근거.

- [ ] 후보 매트릭스: newsapi.org 무료 (100 req/day) / alpha vantage news / benzinga
- [ ] 비교 축: 가격 · 커버리지 (KRX 포함 여부) · rate limit · headline vs full content · sentiment 제공 여부
- [ ] 개인 서비스 규모 (관심종목 + 활성 전략 ~30~50 티커) 대비 rate limit 계산
- [ ] 사용자 최종 선택 → `docs/specs/*-news-api-decision.md` 커밋 후 착수

**노력**: XS (조사 위주)

#### 36-B: NewsCache + fetcher + cron (~1일)

- [ ] Prisma 신규 모델:
  ```
  NewsCache {
    id           String   @id @default(cuid())
    ticker       String
    headline     String
    publishedAt  DateTime
    source       String
    url          String
    sentiment    Float?
    insertedAt   DateTime @default(now())

    @@unique([ticker, url])       // 티커 스코프 dedupe (Codex #438 P2 재리뷰)
    @@index([ticker, publishedAt])
  }
  ```
  - **`@@unique([ticker, url])`**: 하나의 기사 URL 이 여러 티커에 언급될 수 있음 (예:
    "Big Tech 어닝" 기사 → AAPL/MSFT/GOOG). 글로벌 `url @unique` 는 후속 티커의 upsert
    를 막거나 이전 row 를 덮어써 ticker 별 조회에서 헤드라인 누락. composite key 로
    같은 기사 = 티커별 1 row 유지.
  - `(ticker, publishedAt)` composite index (조회 성능)
  - Retention: 30일 (cron 정리)
- [ ] `src/lib/news/fetcher.ts` — 단일 티커 조회, 실패 → error 필드
- [ ] `src/lib/news/cache.ts` — upsert / getByTickerRange / 오래된 삭제
- [ ] `scheduleNewsFetch` — 시간별 (rate limit 감안). 대상 = 활성 전략 티커 ∪ 관심종목
- [ ] 부팅 즉시 초기 시드 (34-A 어닝 패턴)
- [ ] 테스트: fetcher mock + cache upsert + gather 로직

**노력**: S

#### 36-C: `news_keyword` 조건 (evaluator + parser) (~1일)

- [ ] 조건 스키마:
  ```
  { type: 'news_keyword', operator: '>=' | '<=' | '>' | '<' | '==',
    value: number,  // headline 개수
    keyword: string,  // 필수 (필터 키워드)
    timeframe: '24h' | '7d',
  }
  ```
- [ ] Evaluator: NewsCache 조회 → keyword 매치 개수 산출 → numeric 비교
- [ ] Parser 프롬프트 v3 섹션에 예시 추가 (예: "AAPL 관련 24h 뉴스 3건 이상 시")
- [ ] `types.ts` 확장 (NUMERIC 유형이지만 keyword/timeframe 필수 검증)
- [ ] `custom-strategy-alert` 에 `newsMap` 스냅샷 주입
- [ ] 테스트

**노력**: S

## 4. 착수 순서

```
35-A (워밍업) → 35-B → 36-A (승인) → 36-B → 36-C
```

## 5. 제외 사항

- **뉴스 감정 (sentiment) 조건** — 36-B/C 이후 데이터 관찰 → 필요 시 별도 이슈
- **전략 편집 자연어에서 신규 조건 발명** — 지원 조건 밖은 error 로 응답 (등록 로직과 동일)
- **AI advisor 모델 정책 변경** — intent 기반 오토 매핑 이후 개별 오버라이드는 명시 model 로만
- **뉴스 KRX 종목 지원** — 국내 뉴스 API 별도 스코프 (후속)

## 6. 참고

- 15차 도입된 `src/lib/kst-date.ts` — 뉴스 timeframe 계산 시 재사용 가능
- 15차 도입된 `AlertHistory` — 뉴스 조건 발동도 자동 저장 (kind: `custom_strategy` 그대로)
