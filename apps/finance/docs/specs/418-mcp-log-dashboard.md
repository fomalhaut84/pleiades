# [Phase 33-C] MCP 로그 대시보드 + #409 흡수

- **이슈**: #418 (부속 #409 흡수)
- **마스터**: #414
- **작성일**: 2026-07-08

## 목표

32-C 에서 만든 pino JSON 로그 파일 (`logs/mcp-YYYY-MM-DD.log`) 을 웹에서 조회 + 통계. 부속으로 #409 (crash 별도 파일 + 스키마 문서화) 흡수.

## 산출물

### A. Crash 별도 파일 (#409 A)
`logs/mcp-crash-YYYY-MM-DD.log` — fatal + uncaughtException / unhandledRejection 만 tee. 일반 로그와 분리해 pm2 상태 진단 시 fatal 만 빠르게 스캔 가능.

- pino `multistream` 에 `level: 'fatal'` entry 추가
- KST rotation + retention 정책은 기본 파일과 동일 (14일)

### B. 스키마 문서 (#409 B)
`docs/mcp-log-schema.md` — 각 msg 별 (`tool_call`, `sdk_error`, `transport_ready`, `http_server_error`, `http_request_error`, `session_initialized`, `session_closed`, `session_sweep`, `shutdown_started`, `http_server_closed`, `force_exit_timeout`, `server_fatal`, `uncaught_exception`, `unhandled_rejection`, `transport_close_error`) 필드 목록 + 예시.

### C. 대시보드 UI

**API**:
- `GET /api/admin/mcp-logs?date=&level=&msg=&tool=&traceId=&limit=&offset=`
  - `date`: YYYY-MM-DD (기본 = 오늘 KST). `logs/mcp-<date>.log` 파일에서 파싱.
  - `level`: info/warn/error/fatal (whitelist)
  - `msg`: 정확 매치 (whitelist 는 12개 msg 상수)
  - `tool`: tool 이름 (contains)
  - `traceId`: 8자 hex
  - `limit`: 기본 100, 최대 500
  - `offset`: 페이지네이션
  - 응답: envelope + paginated
  - 대용량 방어: 파일 사이즈 확인 후 tail-N 파싱 (최근 항목 우선), max 50k 라인 스캔.

- `GET /api/admin/mcp-logs/stats?date=&level=&msg=&tool=`
  - `total`, `byLevel`, `byMsg`, `byTool` (top 20), `latencyStats` (tool 별 avg/p95/p99 for tool_call)

**페이지** `/admin/mcp-logs`:
- Header (title / sub)
- Filter bar: 날짜 (달력 or 최근 7일 chip), level chip, msg chip, tool 검색, traceId 검색
- Stat cards: 총 이벤트, 에러율, 유니크 tool 수, 평균 latency
- Charts: level 별 파이 + tool 별 호출량 bar
- List: 시각 / level 뱃지 / msg / tool 파란 뱃지 / 요약 (traceId + args preview)
- Pagination

### 접근 제한
개인 서비스라 별도 role 없음. 기존 middleware auth 통과만.

## 파일 변경

**크래시 분리 (#409 A)**:
- `src/mcp/logger.ts` — `openCrashFileStream` 신설, buildStreams 에 crash entry 추가, rotation 도 crash 별도로 스케줄

**스키마 문서 (#409 B)**:
- `docs/mcp-log-schema.md` (신규)

**대시보드**:
- `src/lib/mcp-logs/parser.ts` (신규) — JSON line 파서, tail-N, 필터 pure
- `src/lib/mcp-logs/constants.ts` (신규) — MSG_LABELS, LEVEL_ORDER 등
- `src/app/api/admin/mcp-logs/route.ts` (신규)
- `src/app/api/admin/mcp-logs/stats/route.ts` (신규)
- `src/app/admin/mcp-logs/page.tsx` (신규)
- `src/app/admin/mcp-logs/McpLogsClient.tsx` (신규)
- `src/components/layout/nav-config.ts` (수정) — `/admin/mcp-logs` 링크 추가

**테스트**:
- `src/mcp/__tests__/logger-crash-tee.test.ts` — 크래시 파일이 fatal 만 받는지
- `src/lib/mcp-logs/__tests__/parser.test.ts` — JSON line 파서, 필터, tail-N

## 완료 조건

- [ ] lint / typecheck / test / build 통과
- [ ] self-review P1/P2 = 0
- [ ] verify skill 로 API + 페이지 렌더 확인
- [ ] `docs/mcp-log-schema.md` 커밋
- [ ] #409 CLOSE (같이 처리)

## 제외 사항

- 실시간 tail (WebSocket) — v2
- 로그 다운로드 (CSV) — v2
- 여러 파일 합쳐서 검색 (crash + 일반) — 우선 개별 파일별 검색만
- Prometheus / Grafana 연동 — 스코프 밖
