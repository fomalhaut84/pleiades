# Phase 10: 알림 + 자동화

## 목적
포트폴리오 변동, 예산 초과, 증여 한도, RSU 베스팅 등 주요 이벤트를 텔레그램으로 자동 알림.
사용자가 임계값을 직접 설정할 수 있는 AlertConfig 시스템 구축.

## 서브 이슈

- [x] **10-A**: AlertConfig DB 모델 + /알림설정 커맨드
- [x] **10-B**: 매일 포트폴리오 요약 알림
- [x] **10-C**: 급등락 / 환율 변동 알림
- [ ] **10-D**: 예산 초과 / 증여 한도 경고
- [ ] **10-E**: RSU 베스팅 리마인드 (D-7, D-1)
- [ ] **10-F**: 월간 리포트 자동 발송

---

## 10-A: AlertConfig DB 모델 + /알림설정 커맨드

### 요구사항

- [ ] AlertConfig Prisma 모델 (키-값 저장)
- [ ] 기본 임계값 자동 생성 (seed 또는 최초 접근 시)
- [ ] /알림설정 커맨드 (텔레그램)
  - /알림설정 — 현재 설정 조회
  - /알림설정 급락 -5 — 급락 임계값 변경
  - /알림설정 환율 50 — 환율 변동 임계값 변경
  - /알림설정 예산 80 — 예산 경고 비율 변경
- [ ] API: GET/PUT /api/alerts/config (웹 연동용)

### 기술 설계

```prisma
model AlertConfig {
  id        String   @id @default(cuid())
  key       String   @unique  // "price_drop_pct", "fx_change_krw", "budget_warn_pct"
  value     String            // "-5", "50", "80"
  label     String            // "급락 알림 (%)"
  updatedAt DateTime @updatedAt
}
```

기본값:
| key | value | label |
|-----|-------|-------|
| price_drop_pct | -5 | 급락 알림 (%) |
| price_surge_pct | 5 | 급등 알림 (%) |
| fx_change_krw | 50 | 환율 변동 알림 (원) |
| budget_warn_pct | 80 | 예산 경고 (%) |
| daily_summary_hour | 8 | 일일 요약 발송 시각 (KST) |
| monthly_report_day | 1 | 월간 리포트 발송일 |

### 파일

```
prisma/schema.prisma              # AlertConfig 모델 추가
prisma/seed.ts                    # 기본값 시드
src/app/api/alerts/config/route.ts # GET/PUT API
src/bot/commands/alert.ts          # /알림설정 커맨드
src/bot/index.ts                   # 커맨드 등록
```

---

## 10-B: 매일 포트폴리오 요약 알림

### 요구사항

- [ ] 매일 지정 시각(KST)에 전체 포트폴리오 요약 발송
- [ ] 계좌별 평가금, 일간 변동, 총합
- [ ] AlertConfig의 daily_summary_hour 설정 참조

### 기술 설계

node-cron으로 매일 daily_summary_hour에 실행.
기존 포트폴리오 조회 로직 재사용 (Holding + PriceCache join).

### 파일

```
src/bot/notifications/daily.ts     # 일일 포트폴리오 요약 로직
src/lib/cron.ts                    # 크론 스케줄 추가
```

---

## 10-C: 급등락 / 환율 변동 알림

### 요구사항

- [ ] 주가 갱신 시 전일 대비 급등락 감지 (임계값 초과 시 알림)
- [ ] 환율 변동 감지 (임계값 초과 시 알림)
- [ ] 중복 알림 방지 (동일 종목 당일 1회)

### 기술 설계

가격 갱신 cron(`refreshPrices`) 후 변동률 체크.
AlertConfig에서 임계값 조회 → 초과 시 텔레그램 발송.
마지막 알림 시각을 인메모리 Map으로 관리 (당일 중복 방지).

### 파일

```
src/bot/notifications/price-alert.ts  # 급등락/환율 알림 로직
src/lib/cron.ts                       # 가격 갱신 후 알림 체크 연동
```

---

## 10-D: 예산 초과 / 증여 한도 경고

### 요구사항

- [ ] 소비 입력 후 월 예산 사용률이 임계값 초과 시 알림
- [ ] 증여 입금 후 비과세 한도 사용률이 80% 초과 시 알림

### 기술 설계

소비 기록 시 (`expense.ts` handleExpenseInput) 예산 사용률 체크.
증여 기록 시 (`deposit API`) 증여세 한도 체크.
AlertConfig에서 budget_warn_pct 조회.

### 파일

```
src/bot/notifications/budget-alert.ts  # 예산/증여 경고 로직
src/bot/commands/expense.ts            # 소비 기록 후 알림 체크 연동
```

---

## 10-E: RSU 베스팅 리마인드

### 요구사항

- [ ] RSU 베스팅 D-7, D-1에 텔레그램 알림
- [ ] RSUSchedule 모델의 vestingDate 기준

### 기술 설계

매일 크론으로 RSUSchedule 조회 → vestingDate - 7일, -1일 매칭 시 알림.

### 파일

```
src/bot/notifications/rsu-remind.ts   # RSU 리마인드 로직
src/lib/cron.ts                       # 크론 스케줄 추가
```

---

## 10-F: 월간 리포트 자동 발송

### 요구사항

- [ ] 매월 지정일에 전월 리포트 자동 발송
- [ ] 내용: 계좌별 수익률, 배당금, 소비 요약, 증여세 현황
- [ ] AI 어드바이저로 리포트 생성 (askAdvisor 활용)

### 기술 설계

매월 monthly_report_day에 askAdvisor("전월 리포트 생성") 호출.
결과를 텔레그램으로 발송.

### 파일

```
src/bot/notifications/monthly.ts     # 월간 리포트 로직
src/lib/cron.ts                      # 크론 스케줄 추가
```

---

## 제외 사항

- 웹 알림 설정 UI (향후 Phase)
- 이메일 알림 (텔레그램만)
- 푸시 알림 (PWA, 향후)

## 테스트 계획

```bash
npm run lint && npx tsc --noEmit && npm run build
```

수동:
1. /알림설정 → 현재 설정 표시
2. /알림설정 급락 -3 → 임계값 변경 확인
3. 일일 요약 시각에 텔레그램 알림 수신 확인
4. 종목 급락 시 알림 수신 확인
5. 소비 기록 후 예산 경고 확인
