# [Phase 36-A] 뉴스 API 도입 결정

- **이슈**: #435
- **마스터**: #432
- **작성일**: 2026-07-10
- **상태**: 조사 완료 → **17차 마일스톤으로 이월 결정** (2026-07-10)

## 1. 요구사항 재확인

- **사용 규모**: 개인 서비스, 활성 전략 + 관심종목 ~30~50 티커
- **갱신 주기**: 시간별 cron (24 회/일/티커) → 최대 ~1,200 req/day 이론치
- **데이터**: headline / publishedAt / source / url 필수. sentiment 있으면 활용
- **커버리지**: 미국주 우선. KRX 는 후속 스코프
- **비용 상한**: 월 $50 이하 목표
- **라이선스**: **실서비스 배포 필수** (dev 전용 tier 불가)

## 2. 후보 매트릭스

| 항목 | newsapi.org | Alpha Vantage News | Benzinga Basic |
|---|---|---|---|
| **무료 tier req** | 100/day | **25/day** (공식 support 페이지 명시, 2026-07 확인) | Basic (구체 불명) |
| **무료 라이선스** | ❌ dev 전용 (localhost CORS, 24h 지연, 상용 금지) | 개인/비상용만 (ToS §2 — 상용은 별도 협의) | 확인 필요 (Basic 상용 여부 문의) |
| **유료 최저** | $449/월 (250k req/월) | **$49.99/월** (75 req/min, no daily) | 문의 (전용 상담) |
| **sentiment 내장** | ❌ | ✓ (핵심 강점) | ✓ (higher tier) |
| **historical** | 1개월 (유료 5년) | 광범위 | 광범위 (financial 특화) |
| **KRX 커버** | 부분 | ❌ (미국 위주) | ❌ (미국 금융 전용) |
| **개발자 경험** | REST 단순, SDK 없음 | REST 단순, 문서 명확 | SDK + 문서 풍부 |

### 상세 판단

**newsapi.org 무료 tier — ❌ 실사용 불가**
- CORS localhost 만 허용 → 서버 사이드 fetch 도 규정상 dev 전용
- 상용 금지 명시
- 24h 지연 → 알림 조건에 부적절
- 유료 $449/월 은 스코프 대비 과잉

**Alpha Vantage — ⭐ 후보 1**
- 무료 tier: **25 req/day** (공식 support 페이지 2026-07 확인). 30~50 티커 × 하루 1회
  스캔이면 이미 초과 → **free 검증 경로는 실질 불가**
- 유료 $49.99/월: 75 req/min, no daily → 시간별 갱신 여유
- **sentiment 필드 내장** → 별도 NLP 불필요
- 커버리지 미국 위주 (KRX 없음 — 스펙과 일치)
- 문서 명확
- **라이선스 (ToS §2)**: 개인/비상용만 무료. myFinance 는 세진 개인 서비스 (가족 자산관리)
  → 이 프로젝트 스코프에는 적합. 다른 프로젝트에서 이 문서를 참조 시 유료 협의 필요.

**Benzinga — 조건부 후보 2**
- Basic tier 무료 실제 스펙 불명 (AWS marketplace 리스팅 있으나 세부 미공개)
- 유료는 개별 문의 → 소규모 개인 서비스 대응성 확인 필요
- 미국 금융 전용이라 뉴스 품질 우수 예상

## 3. 추천

### 1순위: Alpha Vantage News Sentiment 유료 $49.99/월
- 이유: 스코프 완벽 매치. sentiment 내장으로 개발 단순화. 예산 여유.
- 30~50 티커 × 24h = 1,200 req/day → 75 req/min 여유 (분당 실제 1건 이하)

### 2순위: Alpha Vantage 무료 tier 로 시작 (스코프 축소) — **재검토 필요**
- 조사 결과 free tier 가 25 req/day 로 확인됨 (Codex #441 P2 반영) → 30~50 티커 스캔에는
  실질 불가. 남는 옵션:
  - 뉴스 조건 등록한 티커만 하루 1회 fetch → 티커 20개 이하로 제한 (약간 여유)
  - 티커 그루핑 조회 지원 여부 확인 (Alpha Vantage news 는 티커 필터 다중 지원 확인 필요)
- 유료 승격 없이 실사용 어려움 → 이 경로는 사실상 유료가 최소 조건

### 3순위: Benzinga Basic
- 이유: 사용자 문의 필요. 즉시 구현 어려움. 재검토 시점 미정

## 4. 사용자 결정

**17차 마일스톤으로 이월** (2026-07-10). 이유:
- 뉴스 조건 도입은 유지·운영·API 비용 부담이 다른 응용 미수 이슈보다 낮은 우선순위
- Phase 35 (35-A `/ai` sonnet 승격 + 35-B 자연어 전략 편집) 만 16차로 배포하고 사용자 검증
- 17차 마일스톤 초입에서 우선순위 재검토 (계속 후속 / 또다시 이월 / 대안 조건)

## 5. 후속

- Phase 36 서브 이슈 (#435 / #436 / #437) 는 **close** — 17차 스코프 결정 시 재발행
- 참고 리서치 결과는 이 문서에 보존 → 재검토 시 재활용

## 5. 참고

- Sources:
  - [News API Pricing](https://newsapi.org/pricing)
  - [Alpha Vantage Premium](https://www.alphavantage.co/premium/)
  - [Alpha Vantage Support (2026-07 rate limits)](https://www.alphavantage.co/support/)
  - [Alpha Vantage Terms of Service (§2 개인/비상용)](https://www.alphavantage.co/terms_of_service/)
  - [Alpha Vantage Rate Limits Guide](https://www.macroption.com/alpha-vantage-api-limits/)
  - [Benzinga API Docs](https://docs.benzinga.com/home)
  - [Best News APIs Compared (Thunderbit)](https://thunderbit.com/blog/best-news-apis-compared)
