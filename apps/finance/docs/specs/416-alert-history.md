# [Phase 33-A] AlertHistory 모델 + 발동 hook

- **이슈**: #416
- **마스터**: #414
- **작성일**: 2026-07-08

## 목표

모든 알림 발동을 DB 에 저장 → 33-B 이력 페이지 + 사후 진단 (예: 재현 이슈) 데이터 소스.

## 스키마

```prisma
model AlertHistory {
  id             String   @id @default(cuid())
  firedAt        DateTime @default(now())
  kind           String   // surge / drop / fx / target_hit / stop_loss / watch_buy / watch_zone / ta_signal / custom_strategy
  ticker         String?  // null 허용 (환율 등)
  price          Float?
  changePercent  Float?
  message        String   // 발송 본문 (per-event HTML)
  deliveryStatus String   // 'sent' | 'partial' | 'failed'
  recipientCount Int      @default(0)
  errorMessage   String?

  @@index([firedAt])
  @@index([kind, firedAt])
  @@index([ticker, firedAt])
}
```

- **1 행 = 1 이벤트** (한 번의 텔레그램 발송에 여러 이벤트가 들어가면 여러 행 저장)
- `deliveryStatus` 는 배치 발송 결과 요약 (chatIds 전원 성공 = sent, 일부 = partial, 전원 실패 = failed)
- `errorMessage` 는 실패 시 마지막 예외 (진단용)

## Helper — `src/bot/notifications/alert-history.ts`

- `type AlertKind = ...`
- `type DeliveryStatus = 'sent' | 'partial' | 'failed'`
- `computeDeliveryStatus(successCount, total)` — pure
- `recordAlertHistory(events, deliveryStatus, recipientCount, errorMessage?)` — Prisma createMany. 실패는 로그만.

## Hook 지점

기존 알림 스캐너 3곳 각각 이벤트 수집 후 저장:

### `price-alert.ts`
- 급등 → `surge`
- 급락 → `drop`
- 환율 → `fx`
- 보유종목 목표가 도달 → `target_hit`
- 보유종목 손절가 도달 → `stop_loss`
- 관심종목 목표매수가 → `watch_buy`
- 관심종목 매수구간 진입 → `watch_zone`

문자열 `alerts.push(...)` 대신 구조체 `events.push({ kind, ticker, price, changePercent, message })` 로 변경. 배치 발송 후 `recordAlertHistory` 호출.

### `ta-signal-alert.ts`
- `ta_signal` — 한 티커의 여러 signal 을 하나의 event 로 통합 (`signals.join(', ')` 을 message 로)
- 발송 성공 후 저장

### `custom-strategy-alert.ts`
- `custom_strategy` — 한 전략 발동 = 한 이벤트
- 발송 성공 후 저장

## MCP tool — `src/mcp/tools/alert-history.ts`

```
list_alert_history(kind?, ticker?, from?, to?, limit?)
```

- `kind`: 필터 (미지정 시 전체)
- `ticker`: 필터
- `from` / `to`: ISO 8601 문자열
- `limit`: 기본 50, 최대 200
- 결과: markdown 리스트 (시각 / 종류 / 종목 / 메시지 요약 / 배송 상태)

`src/mcp/server.ts` 에 tool 등록.

## 테스트

- `alert-history.test.ts`:
  - `computeDeliveryStatus` — total=0 → failed, 전원 성공 → sent, 전원 실패 → failed, 일부 성공 → partial
  - `recordAlertHistory` — 빈 events 는 no-op
- `price-alert-history-integration.test.ts` — pure 부분만 (event 수집 로직 refactor 후)
- `mcp/tools/alert-history.test.ts` — 필터 조합 검증 (prisma mock)

## 완료 조건

- [ ] Prisma migration 생성 + 적용
- [ ] lint / typecheck / test / build 통과
- [ ] self-review P0/P1/P2 = 0
- [ ] MCP tool 텔레그램 AI 에서 호출 성공 (배포 후 검증)

## 제외 사항

- 33-B 이력 페이지 UI — 별도 이슈 (#417)
- 알림 자체 로직 변경 — 순수 관측/저장만 추가
- 33-D 이전 발동은 복원 불가 (마이그레이션 시점부터 축적)
