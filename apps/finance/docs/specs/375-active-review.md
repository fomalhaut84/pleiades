# [Phase 29-D v1] 능동 AI 인사이트 cron — 클로징/주간 리뷰

- **작성일**: 2026-07-01
- **타입**: feature (P2)
- **참조**: 마스터 이슈 #370

## 1. 배경

기존 능동 AI 인사이트는 아침 브리핑 (한국장 08:30 / 미국장 23:00) 만 존재. 장 마감 후 "오늘 뭐 일어났고 내일 뭘 볼지" 정리와 주말 회고가 없음.

## 2. 추가할 cron 3개

| Cron | KST 시간 | 요일 | 대상 |
|---|---|---|---|
| 한국장 클로징 리뷰 | 15:40 | 월-금 | KR 종목 오늘 움직임 + 내일 관찰 포인트 |
| 미국장 클로징 리뷰 | 07:15 | 화-토 | US 종목 오늘 움직임 + 오늘밤 관찰 포인트 |
| 주간 리뷰 | 09:00 | 토 | 지난주 포트폴리오 성과 + 다음주 이벤트 캘린더 |

- 한국장 15:30 마감 → 안전 마진 10분 (yahoo daily candle 확정)
- 미국장 마감은 DST 여부에 따라 달라짐. 두 계절 모두 75분+ 마진 확보:
  - EDT (3~11월): 05:00 KST 마감 → 07:15 는 135분 마진
  - EST (11~3월): 06:00 KST 마감 → 07:15 는 75분 마진
- 주간은 토요일 아침, 사용자가 조용히 읽을 수 있는 시간

## 3. 요구사항

- [ ] **R1**: 신규 `src/bot/notifications/active-review.ts` — `sendClosingReview(session)` + `sendWeeklyReview()`
- [ ] **R2**: `askAdvisor` 기반 AI 프롬프트 (`stock-trading-method` + `get_portfolio` + `get_technical_analysis` + `get_all_strategies` 활용)
- [ ] **R3**: scheduler.ts 에 cron 3개 등록
- [ ] **R4**: 사용자 on/off — `AlertConfig.active_review` = `'on'` (기본 on) / `'off'`
- [ ] **R5**: AI 실패 시 fallback 안내 메시지 (모닝 브리핑과 동일 패턴)
- [ ] **R6**: sanitizeError 로 로그, sendHtml 로 재시도/HTML fallback 이미 처리

## 4. 프롬프트 설계

### 클로징 리뷰 (KR/US 각각)
```
[한국장 or 미국장] 클로징 리뷰를 작성해줘.

다음 단계:
1. get_all_strategies로 전체 전략 확인
2. get_portfolio(전체)로 현재 보유 상태 (평가/손익)
3. 오늘 [KR or US] 시장 관련 뉴스 (WebSearch: 종가/이슈)
4. 전략별 종목 중 유의미한 움직임 있는 것만 TA 재확인

리뷰 구성:
- 오늘 시장 요약 (지수/주요 이슈)
- 보유 종목 오늘 성과 (전략별 요약)
- 관찰 필요 종목 (다음 세션 대비)
- 내일/오늘밤 이벤트 (실적/FOMC/일정)

간결하게 (총 6~8줄). 매매 결정은 사용자 몫이라 참고만.
```

### 주간 리뷰 (토 09:00)
```
지난주 (월-금) 포트폴리오 회고 + 다음주 캘린더.

다음 단계:
1. get_networth로 순자산 스냅샷
2. get_performance(전체, 1M)로 지난 1개월 TWR
3. 관심종목/보유종목 중 지난주 유의미한 이벤트 (전략 태그별)
4. WebSearch로 다음주 주요 이벤트 (실적/FOMC/한국지표)

구성:
- 지난주 하이라이트 (성과 요약, top-3 종목 기여도)
- 리스크/기회 지점
- 다음주 관찰 캘린더 (요일별 이벤트)
- 전략 재조정 힌트 (있다면)
```

## 5. AlertConfig

기존 `AlertConfig` 키에 `active_review` 추가:
- `'on'` (기본): 클로징 + 주간 리뷰 모두 활성
- `'off'`: 세 cron 모두 조용

scheduler cron 안에서 `alertConfig.findUnique({ where: { key: 'active_review' } })` 조회 → `value === 'off'` 시 조기 리턴.

## 6. 변경 파일

- `src/bot/notifications/active-review.ts` (신규)
- `src/bot/notifications/scheduler.ts` (cron 3개 등록)
- (선택) `src/app/api/alerts/config/route.ts` — active_review 키 지원 확인 (기존 key 자유롭게 upsert 가능하면 변경 없음)

## 7. 테스트

- `npm run lint && npx tsc --noEmit && npm run test:run && npm run build`
- 수동:
  - 배포 후 첫 15:40 KST 평일 → 한국장 클로징 리뷰 도착 확인
  - `AlertConfig.active_review='off'` 설정 → 조용해지는지
  - 텔레그램 `/reset` 후 새 세션에서 AI 응답 정상 (Phase 29-A/B 배포 후 필요)

## 8. 제외 사항

- 능동 리뷰 depth 커스터마이징 (다음 phase)
- 알림 스타일 다변화 (이미지/차트 첨부 등)

## 9. 위험

- AI 능동 호출 3 cron 추가 → Max 플랜 예산 영향 미미 (하루 3 호출 추가)
- 15:40 KST 클로징 시각에 서버 부하 spike 가능 — 지금 다른 cron 과 겹치지 않도록 확인 (15:35 RSU 확정과 5분 차이 OK)
