# [Phase 33-B] 알림 이력 페이지 (/alerts/history)

- **이슈**: #417
- **마스터**: #414
- **선행**: #416 (AlertHistory 모델, 이미 머지됨)
- **작성일**: 2026-07-08

## 목표

웹에서 알림 발동 이력을 필터·통계와 함께 조회. AI 자연어 질의 (`list_alert_history` MCP) 의 웹 UI 대응.

## 사용자 흐름

1. 텔레그램 알림을 받은 뒤 웹에서 "어떤 알림이 언제 왔나" 확인 → `/alerts/history` 진입
2. 기본: 최근 7일 전체 kind
3. 필요 시 기간(7/30/90일) / kind(칩 토글) / ticker 검색 조합 필터
4. 상단 통계 카드로 발동 추이 요약, 하단 리스트로 개별 이벤트 상세

## API 설계

### `GET /api/alerts/history`

Query params:
- `kind` (optional): kind 필터 (단일)
- `ticker` (optional): 대문자 정규화 후 exact match
- `from`, `to` (optional): ISO 8601. 미지정 시 최근 7일
- `limit` (optional): 기본 50, 최대 200
- `offset` (optional): 기본 0

Response (envelope):
```
{
  success: true,
  data: [ AlertHistoryRow, ... ],
  meta: { total: number, limit: number, offset: number },
}
```

### `GET /api/alerts/history/stats`

Query params: 동일 (kind/ticker/from/to)

Response:
```
{
  success: true,
  data: {
    total: number,
    byStatus: { sent: number, partial: number, failed: number },
    byKind: [ { kind, count }, ... ],
    byDay: [ { date: 'YYYY-MM-DD', count: number }, ... ],
  }
}
```

## 페이지 (`src/app/alerts/history/page.tsx` + `AlertHistoryClient.tsx`)

### 레이아웃 (기존 site 패턴 재사용 — 별도 프로토타입 없이 dashboard-prototype 톤 그대로)

```
┌ Header(title, sub) ────────────────────────────────┐
│                                                    │
│ [필터 바] 기간 · kind 칩 · ticker 검색            │
│                                                    │
│ [Stat 4개]  총건수  성공률  종류수  티커수         │
│                                                    │
│ [Chart 2개] 일별 발동 라인 (Recharts)              │
│             종류별 파이 (또는 스택 바)             │
│                                                    │
│ [리스트]  시각 · kind 뱃지 · ticker · 메시지 · 상태│
│ [페이지네이션] Prev / N / M / Next                 │
└────────────────────────────────────────────────────┘
```

### 색상/스타일

- 기존 다크 톤 + `sejin=#34d399` 강조
- kind 뱃지 컬러:
  - surge → emerald (성공)
  - drop → red
  - fx → sky
  - target_hit / watch_buy → sejin (green)
  - stop_loss → red
  - watch_zone → amber
  - ta_signal → violet
  - custom_strategy → orange
- 상태 뱃지:
  - sent → sejin
  - partial → amber
  - failed → red

### 반응형

- 모바일: 필터 세로 스택, 차트 1열, 리스트 카드 형태
- 데스크톱: 필터 가로, 차트 2열 (라인/파이 병렬), 리스트 테이블

## 파일 변경

- `src/app/api/alerts/history/route.ts` (신규) — GET list
- `src/app/api/alerts/history/stats/route.ts` (신규) — GET stats
- `src/app/alerts/history/page.tsx` (신규)
- `src/app/alerts/history/AlertHistoryClient.tsx` (신규)
- 네비게이션 링크 (설정 페이지 등에서 접근 가능하도록) — 위치는 착수 시 결정

## 테스트

- API route: 필터 조합 검증 (envelope + pagination)
- Stats: kind/status 집계 + byDay bucket 정합성
- Client 유닛: 기간 프리셋 로직 pure, kind toggle set

## 완료 조건

- [ ] lint / typecheck / test / build 통과
- [ ] self-review P0/P1/P2 = 0
- [ ] 로컬 실행 후 필터/차트/리스트 정상 렌더링 확인 (verify skill)
- [ ] 모바일 뷰포트 검증

## 제외 사항

- 알림 상세 모달 (kind 별 컨텍스트 표시) — v2
- 이력 export (CSV) — v2
- 알림 재발송 / 재시도 — 별도 스코프
- 접근 제한 (관리자 전용) — 개인 서비스라 인증 미적용 상태 유지
