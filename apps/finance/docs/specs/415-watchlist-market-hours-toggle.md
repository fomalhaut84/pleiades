# [Phase 33-D] 관심종목 알림 시간대 토글

- **이슈**: #415
- **마스터**: #414 (`docs/specs/414-milestone-15-master.md`)
- **작성일**: 2026-07-08
- **타입**: 기능 확장 (알림 정책)

## 1. 배경

관심종목 알림 (💰 목표매수가 도달, 🔔 매수구간 진입) 은 spec 상 24h 허용이 정상이나 사용자 인식과 불일치 — 장 마감 후에 오는 관심종목 알림을 노이즈로 인식.

`src/bot/notifications/price-alert.ts` line 179~205 의 watchlist loop 는 `isMarketOpenFor` 필터를 적용하지 않음 (반면 급등락 line 107 은 적용). 이는 CLAUDE.md 규칙:
> 환율/목표가/매수구간 알림은 24시간.

과 일치하지만, 사용자는 관심종목 알림만 장중 only 로 제한하는 옵션을 원함.

## 2. 접근

`AlertConfig` 는 key-value 스키마 (Prisma schema.prisma:322). **스키마 변경 없이 새 key 추가로 처리**.

- Key: `watchlist_market_hours_only`
- Value: `on` / `off` (toggle)
- 기본값: `off` (하위호환 — 기존 24h 동작 유지)
- 카테고리: `price`
- Input type: `toggle`

## 3. 변경 상세

### 3.1 `src/bot/notifications/price-alert.ts`

- 상수 추가: `WATCHLIST_MHO_KEY`, `WATCHLIST_MHO_LABEL`
- `ensureWatchlistMarketHoursOnlySetting()` 함수 export (다른 `ensure*` 와 동일 패턴)
- `checkPriceAlerts()` 내:
  - `findMany` 의 `key: { in: [...] }` 배열에 새 key 추가
  - `configMap.get(WATCHLIST_MHO_KEY)?.toLowerCase() === 'on'` boolean 산출
  - watchlist loop (line 179~) 진입 시: `if (marketHoursOnly && !isMarketOpenFor(price.market, w.ticker)) continue`

적용 범위:
- 💰 `targetBuy` (목표매수가)
- 🔔 매수구간 진입

환율/보유종목 목표가/손절가는 무영향.

### 3.2 `src/lib/alert-config/categories.ts`

- `ALERT_KEY_CATEGORY['watchlist_market_hours_only'] = 'price'`
- `ALERT_KEY_INPUT_TYPE['watchlist_market_hours_only'] = 'toggle'`
- `ALERT_KEY_DESCRIPTION['watchlist_market_hours_only'] = '관심종목 목표매수가/매수구간 알림을 각 시장 거래시간에만 발송 (기본 off = 24h)'`

### 3.3 `src/bot/notifications/scheduler.ts`

- `ensureWatchlistMarketHoursOnlySetting` import + `.catch` 로 호출 등록 (다른 ensure 와 동일)

### 3.4 UI

`AlertConfigEditor` 는 key-value 리스트를 자동 렌더링하므로 **UI 코드 변경 불필요**. 새 key 가 설정 페이지의 "가격 / 환율 알림" 카테고리에 자동 등장.

## 4. 테스트

`src/bot/notifications/__tests__/price-alert-watchlist.test.ts` 신규:

시나리오 (4개):
1. `off` + 장중 → 알림 발동
2. `off` + 장외 → 알림 발동 (하위호환)
3. `on` + 장중 → 알림 발동
4. `on` + 장외 → 알림 **차단**

또한 카테고리 매핑 테스트 (`src/lib/alert-config/__tests__/categories.test.ts` 확장).

## 5. 완료 조건

- [ ] lint / typecheck / test / build 통과
- [ ] 코드 리뷰 P1/P2 = 0
- [ ] 서버 배포 후 설정 페이지 "가격 / 환율 알림" 에 새 토글 노출 확인
- [ ] 실제 켠 상태로 장 마감 후 관심종목 매수구간 알림 미발동 확인

## 6. 제외 사항

- 보유종목 목표가/손절가 시간대 필터링 — 현행 24h 유지 (spec 그대로)
- 환율 알림 필터링 — 24h 유지
- 종목별 개별 토글 (마스터 스펙에 언급된 대안) — 이번엔 글로벌 토글만. 종목별은 후속 이슈로 이월 가능
