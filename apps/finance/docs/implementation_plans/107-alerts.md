# Phase 10: 알림 + 자동화 — 구현 계획 (사후 기록)

## 서브 이슈
- #108: 10-A AlertConfig DB 모델 + /알림설정 커맨드
- #110: 10-B 매일 포트폴리오 요약 알림
- #112: 10-C 급등락 / 환율 변동 알림
- #114: 10-D 예산 초과 / 증여 한도 경고
- #116: 10-E RSU 베스팅 리마인드 (D-7, D-1)
- #117: 10-F 월간 리포트 자동 발송

## 주요 변경 파일
```
신규:
  prisma/migrations/ — AlertConfig 모델
  src/app/api/alerts/ — GET/PUT config API
  src/bot/commands/alert-settings.ts — /알림설정
  src/bot/notifications/ — daily-summary, price-alert, budget-alert, gift-alert, rsu-remind
  src/cron/ — 알림 스케줄러
```

## DB 마이그레이션
- AlertConfig 모델 추가

## 구현 순서
1. AlertConfig 모델 + 시드 (기본 임계값) + /알림설정 커맨드
2. 매일 포트폴리오 요약 (daily_summary_hour 기준)
3. 급등락/환율 변동 알림 (refreshPrices 후 체크)
4. 예산 초과 / 증여 한도 경고
5. RSU 베스팅 D-7, D-1 리마인드
6. 월간 리포트 자동 발송 (AI sonnet 생성)
