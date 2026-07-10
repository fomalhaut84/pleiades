# 15차 마일스톤 — 관측 & 이력 & 전략 확장 (마스터)

- **작성일**: 2026-07-08
- **타입**: 마일스톤 (마스터 스펙, sub-phase 로 분할 진행)
- **참조**: 14차 마스터 #402, `memory/project_next_milestone_15.md`

## 1. 배경

14차 마일스톤 (#402) 완료로 MCP 서버가 상시 상주 HTTP 프로세스로 격상되고 pino 구조화 로그가 파일에 남게 되면서 **사후 관찰 기반**이 마련되었다. 15차는 이 관찰 기반을 실사용자 가시성으로 확장하고, 알림 정책·전략 조건을 강화한다.

**사용자가 명시한 두 축**:
1. **관측 강화** — 알림 발동 이력 (당장 재현되는 장외 알림 원인 데이터로 파악) + MCP tool 호출 대시보드 (32-C 로그의 UI화)
2. **전략 확장** — 커스텀 전략 v3 (어닝/크로스-티커/뉴스 조건)

**부수 발견**: 사용자로부터 "장 마감 후에도 관심종목 매수구간 알림이 오는 문제"가 재현된다는 리포트. 코드 확인 결과 spec 상 관심종목/목표가/환율 알림은 24h 허용이 정상 동작이나 **사용자 인식과 불일치** → 33-D 로 사용자 토글 도입.

## 2. 목표

15차 종료 시:
- ✅ 알림 발동 이력이 DB 에 축적되고 웹 UI 로 조회 가능
- ✅ MCP tool 호출 대시보드 (호출량/에러율/latency) 제공 + 크래시 별도 파일 분리
- ✅ 관심종목 알림 시간대 (24h vs 장중 only) 사용자 설정 가능
- ✅ 커스텀 전략에 어닝 임박·크로스-티커 조건 추가 (뉴스는 착수 시 승인)

## 3. Sub-Phase 분할

### Phase 33: 관측 & 이력 & 알림 정책

#### 33-D: 관심종목 알림 시간대 토글 (선행 — spec 명확)

**목적**: 사용자 인식과 spec 일치. 매수구간/목표매수가 알림을 장중 only 로 제한할 수 있게.

- [ ] `AlertConfig` (owner 별) 에 `watchlistMarketHoursOnly: boolean` 필드 추가 (기본 `false` = 24h 하위호환)
- [ ] `price-alert.ts` 의 관심종목 loop (line 179~205) 에서 config 참조하여 `isMarketOpenFor` 필터 조건부 적용
- [ ] `settings` 페이지의 AlertConfig UI 에 스위치 추가 ("관심종목 매수 알림 — 장중에만")
- [ ] 테스트: 장중/장외 시나리오 x 토글 on/off 조합

**의존성**: 없음 (독립)
**노력**: XS (반나절)

#### 33-A: AlertHistory 모델 + 발동 hook

**목적**: 모든 알림 발동을 DB 에 저장 → 33-B 이력 페이지와 재현 이슈 사후 진단의 데이터 소스.

- [ ] Prisma 신규 모델 `AlertHistory`:
  - id, firedAt, kind (`surge` | `drop` | `target_hit` | `stop_loss` | `watch_buy` | `watch_zone` | `fx` | `ta_signal` | `custom_strategy`)
  - ticker (nullable — 환율 등), price, changePercent, message, deliveryStatus (`sent` | `failed`)
  - chatId (Int64), errorMessage (nullable)
- [ ] Migration
- [ ] `price-alert.ts`, `ta-signal-alert.ts`, 커스텀 전략 알림 각 hook 지점에 `prisma.alertHistory.create` 호출 (트랜잭션 밖 — 실패 시 로그만)
- [ ] MCP tool 추가: `list_alert_history(kind, ticker, from, to, limit)` — 텔레그램 AI 에서도 조회 가능
- [ ] 테스트: 각 알림 종류별 저장 검증

**의존성**: 33-D 이후 (같은 정책 적용 상태에서 이력 기록)
**노력**: S (하루)

#### 33-B: 알림 이력 페이지

**목적**: 웹에서 알림 발동 이력 시각화.

- [ ] `/alerts/history` 라우트
- [ ] 필터: 기간 (7/30/90일), 종류 (multi), 티커 검색
- [ ] 리스트: 시각, 종목, 종류 뱃지, 메시지, 성공/실패
- [ ] 상단 요약: 기간 내 총 건수, 종류별 파이 차트, 일별 발동 건수 라인 차트
- [ ] mobile 반응형 (14차 마일스톤 15와 별도 — 이 페이지만 우선)
- [ ] 디자인: `frontend-design` 스킬 활용, `docs/designs/` 저장

**의존성**: 33-A
**노력**: S (하루)

#### 33-C: MCP 로그 대시보드 + #409 follow-up

**목적**: 32-C 의 pino JSON 로그 파일을 웹에서 조회 가능하게 + #409 (crash 분리, 스키마 문서화) 병행.

- [ ] `/admin/mcp-logs` 라우트 (관리 페이지 — 접근 제한 방식은 착수 시 결정)
- [ ] 로그 파일 파서 (`logs/mcp-YYYY-MM-DD.log` JSON lines)
- [ ] 필터: 날짜, level (info/warn/error/fatal), msg (tool_call, sdk_error, http_server_error 등), tool 이름, traceId
- [ ] 통계: 날짜별 호출 건수, tool 별 평균 latency, 에러율
- [ ] **#409 통합**:
  - `logs/mcp-crash-YYYY-MM-DD.log` 별도 파일 (fatal + uncaughtException 만)
  - `docs/mcp-log-schema.md` — 각 msg 종류별 필드 문서화
- [ ] 성능: 대용량 파일 대비 tail-N 우선 로드 + 페이지네이션

**의존성**: 없음 (33-A/B 와 병행 가능)
**노력**: M (1~2일)

### Phase 34: 커스텀 전략 v3

#### 34-A: 어닝 캘린더 조건

**목적**: 어닝 임박/직후 종목 진입/회피 자동화.

- [ ] `yahoo-finance2` 의 `quoteSummary(ticker, { modules: ['calendarEvents'] })` 활용 (무료)
- [ ] 커스텀 전략 v2 조건에 `earnings_within_days` 추가 (예: D-3 이내면 skip, D+1 이후 진입)
- [ ] 캐시: `EarningsCache` 모델 (ticker, nextEarningsDate, updatedAt) — cron 으로 일 1회 갱신
- [ ] UI: `/strategies` 편집 폼에 조건 추가
- [ ] 테스트: 어닝 D-3/당일/D+1 시나리오

**의존성**: 없음 (v2 확장)
**노력**: S (하루)

#### 34-B: 크로스-티커 조건

**목적**: SPY, VIX 등 벤치마크 상태를 개별 종목 진입 조건으로.

- [ ] 조건 스키마: `cross_ticker` — `{ ticker: 'SPY', metric: 'changePercent' | 'price', operator: '<=' | '>=', threshold: number }`
- [ ] 평가 로직: 대상 티커의 PriceCache 조회 후 threshold 비교
- [ ] UI: 다중 조건 with 다른 티커 선택
- [ ] 테스트

**의존성**: 34-A (같은 조건 프레임워크)
**노력**: S (하루)

#### 34-C: 뉴스 조건 (외부 API 도입)

**목적**: 종목/섹터 관련 뉴스 이벤트 조건.

- [ ] 후보 API 조사 & 승인: newsapi.org (무료 tier 제한), alpha vantage news (제한적), benzinga (유료). 착수 시 별도 스펙.
- [ ] Rate limit / 캐시 전략
- [ ] 조건 스키마: `news_keyword` — `{ keyword, timeframe: '24h' | '7d', min_count: number }`
- [ ] 착수 승인 후 진행 (뒤로 미룰 수 있음)

**의존성**: 34-B, 사용자 승인
**노력**: M (2~3일, API 조사 포함)

## 4. 착수 순서

```
33-D (선행, 사용자 pain 해결) → 33-A (모델) → 33-B (이력 UI)
→ 33-C (대시보드) → 34-A → 34-B → 34-C (승인 후)
```

## 5. 제외 사항

- 알림 자체 로직 변경 (급등락 임계값 등) — 별도 이슈
- 모바일 웹 UX 전면 재검토 — 16차 후보로 이월
- 백테스트 UX 확장 — 16차 후보로 이월
- 성능/부하 튜닝 — 33-C 결과 관찰 후 필요 시 별도 이슈

## 6. 산출물

- `docs/specs/*` (sub-phase 별)
- `docs/designs/33-B-*`, `docs/designs/33-C-*` (UI 시안)
- `docs/mcp-log-schema.md` (33-C 결과물)
- Prisma migrations: `AlertHistory`, `AlertConfig.watchlistMarketHoursOnly`, `EarningsCache`
- 신규 페이지: `/alerts/history`, `/admin/mcp-logs`
