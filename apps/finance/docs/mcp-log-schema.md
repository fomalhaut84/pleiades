# MCP 로그 스키마

**출처**: pino JSON lines. Phase 32-C 에서 도입 (`src/mcp/logger.ts`), Phase 33-C (#418) 로 문서화. #409 흡수. Phase 37-D (#447) — retention 명문화 + 다운로드 endpoint 추가.

## 파일 위치

- `logs/mcp-YYYY-MM-DD.log` — 전체 로그 (info 이상)
- `logs/mcp-crash-YYYY-MM-DD.log` — **fatal 만** 별도 tee (33-C 신규). pm2 crash 진단 시 이 파일만 스캔.
- 날짜는 KST 기준. 매일 자정에 rotation. 14일 retention 자동 정리.

## Rotation · Retention 정책

- **Rotation**: 매일 KST 00:00 (자정) 에 새 파일. `scheduleFileRotation` 이 5분 주기 setInterval 로 KST 날짜 변화를 감지 → 새 stream open + old flush+end (`src/mcp/logger.ts:111-135`). 실제 rotation timing 은 00:00~00:05 사이.
- **Retention**: 기본 14일. `mtime` 기준으로 cutoff 초과된 `mcp-*.log` / `mcp-crash-*.log` 를 삭제.
- **Prune 트리거**: (a) 매 rotation 직후 (`openFileStream` 안에서 `pruneOldLogs` 호출), (b) 프로세스 부팅 시 (첫 stream open). 별도 cron 없음 — best effort.
- **환경변수** (`src/mcp/logger.ts:11-38`):
  - `MCP_LOG_TEE_FILE=1` — 파일 로거 활성 (기본 off). `ecosystem.config.js` 에 설정됨
  - `MCP_LOG_RETENTION_DAYS` — retention 일수 (기본 `14`, 0 이하면 정리 비활성)
  - `MCP_LOG_DIR` — 로그 디렉토리 (기본 `logs/`)

## 관리 UI · API

- **대시보드**: `/admin/mcp-logs` — 스냅샷 조회 + 실시간 tail (37-C) + 원본 다운로드 (37-D).
- **API**:
  - `GET /api/admin/mcp-logs?date=YYYY-MM-DD&crash=1&level=&msg=&tool=&traceId=&limit=&offset=` — 페이지네이션 리스트
  - `GET /api/admin/mcp-logs/stats?...` — 통계 요약
  - `GET /api/admin/mcp-logs/stream?level=&msg=&tool=&traceId=` — 실시간 SSE (오늘 KST 일반 로그만)
  - `GET /api/admin/mcp-logs/download?date=YYYY-MM-DD&kind=main|crash` — **원본 파일 다운로드** (37-D 신규). date 는 정규식+캘린더 검증, kind 는 화이트리스트. 경로 traversal 방어.

## 공통 필드 (모든 라인)

| 필드 | 타입 | 설명 |
|---|---|---|
| `level` | string | `info` / `warn` / `error` / `fatal` |
| `time` | string | ISO 8601 UTC (`pino.stdTimeFunctions.isoTime`) |
| `pid` | number | 프로세스 PID |
| `service` | string | 항상 `"mcp"` (base pair) |
| `msg` | string | 이벤트 종류 (아래 목록 참조) |

`redact` 대상 필드 (`args.password`, `args.token`, `args.secret`, `args.apiKey`, `*.password`, `*.token`, `*.secret`, `*.apiKey`, `*.jwt`, `args.body.password`, `args.body.token`, `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`) 는 pino 가 `[REDACTED]` 로 치환. `summarizeArgs` 는 그 이전에 대소문자 무관 sensitive key normalize + 특수 타입 방어 (`Date`, `Buffer`, `Error`, `Map`, `Set`).

## 이벤트 목록

### `tool_call` (info)
MCP tool 호출 성공 (handler 정상 return).

| 필드 | 타입 | 설명 |
|---|---|---|
| `tool` | string | 호출된 tool 이름 (예: `get_portfolio`) |
| `args` | object | 인자 요약. 200자 초과 시 `{ _truncated: true, preview }` |
| `latency_ms` | number | handler 실행 시간 (밀리초) |
| `traceId` | string | 8자 hex (`newTraceId`) — 요청 상관관계 |
| `status` | string | 항상 `"ok"` |

### `tool_call_reported_error` (warn)
Handler 가 `toolError({...})` 로 정상 반환 (biz error).

| 필드 | 추가 |
|---|---|
| `status` | `"error"` |
| `err.kind` | `"tool_reported_error"` |
| `err.message` | handler 가 반환한 사용자 대상 메시지 |

`tool` / `args` / `traceId` 는 tool_call 과 동일.

### `tool_call_failed` (error)
Handler 가 예외를 throw. instrumentation wrapper 가 rethrow 전에 기록.

| 필드 | 값 |
|---|---|
| `tool` | tool 이름 |
| `args` | summarizeArgs 결과 |
| `latency_ms` | throw 발생 시점까지의 시간 |
| `traceId` | 8자 hex |
| `status` | `"error"` |
| `err.name` / `err.message` / `err.stack` | 예외 정보 |

### `tool_call_sdk_error` / `sdk_error` (warn)
Handler 가 실행 전/후 SDK 레벨 오류 (Zod 검증 실패, 미등록 tool, empty response 등).

| 필드 | 값 |
|---|---|
| `tool` | 감지 가능한 경우 (unknown 가능) |
| `args` | summarizeArgs 결과 (없으면 생략) |
| `status` | `"error"` |
| `err.kind` | `"sdk_error"` |
| `err.code` | SDK 에러 코드 (있으면) |
| `err.message` | 원인 요약 (`handler not invoked (no response captured)` 등) |

### `transport_ready` (info)
서버 부팅 완료.

| 필드 | 값 |
|---|---|
| `transport` | `"stdio"` 또는 `"http"` |
| `host` | HTTP 모드에서만. 기본 `127.0.0.1` |
| `port` | HTTP 모드에서만. 기본 4210 |

### `http_server_error` (fatal)
HTTP 서버 자체 부팅/binding 오류 (예: `EADDRINUSE`). **crash 파일에도 기록.**

| 필드 | 값 |
|---|---|
| `err.message` | 예: `bind EADDRINUSE 127.0.0.1:4210` |
| `err.stack` | 스택 |

### `http_request` (info)
HTTP 모드에서 SDK 로 위임한 요청 처리 완료.

| 필드 | 값 |
|---|---|
| `httpMethod` | `GET` / `POST` 등 |
| `rpcMethod` | JSON-RPC method (`tools/call`, `initialize` 등) |
| `sid` | 세션 ID (신규는 `(new)`) |
| `latency_ms` | 요청 처리 시간 |

### `http_request_error` (error)
개별 HTTP 요청 처리 중 예외 (transport 이벤트 등).

### `session_initialized` / `session_closed` (info)
HTTP 모드 세션 라이프사이클.

| 필드 | 값 |
|---|---|
| `sid` | 세션 ID |
| `total` | 현재 활성 세션 수 |

### `session_sweep` (info)
만료된 세션 정리 (30분 idle TTL).

| 필드 | 값 |
|---|---|
| `count` | 정리된 세션 수 |
| `ttl_min` | 30 (분) |

### `transport_close_error` (warn)
세션 닫기 중 오류 (best-effort).

### `shutdown_started` / `http_server_closed` / `force_exit_timeout` (info/warn)
SIGTERM/SIGINT 처리.

| 필드 | 값 |
|---|---|
| `signal` | `SIGTERM` / `SIGINT` |
| `active_sessions` | 종료 시점 세션 수 |

### `server_fatal` (fatal)
`startServer` 최상단 catch. **crash 파일에도 기록.**

| 필드 | 값 |
|---|---|
| `err.message` | 오류 |
| `err.stack` | 스택 |

### `uncaught_exception` / `unhandled_rejection` (fatal)
`installCrashHandlers` 등록 프로세스 이벤트. **crash 파일에도 기록** → 이후 100ms 뒤 `process.exit(1)` (PM2 재시작 유도).

| 필드 | 값 |
|---|---|
| `err.name` | 오류 종류 |
| `err.message` | 메시지 |
| `err.stack` | 스택 (Error 인 경우) |

## 진단 팁

**"MCP tool 호출이 실패하는데 원인이 뭐지?"**
1. `grep '"msg":"tool_call_sdk_error"' logs/mcp-*.log` → SDK 우회 실패 (스키마 오류 등)
2. `grep '"msg":"tool_call_reported_error"' logs/mcp-*.log` → 비즈니스 예외 (사용자 대상 메시지)
3. `grep '"msg":"tool_call_failed"' logs/mcp-*.log` → handler 가 throw 한 예외 (stack 포함)

**"서버가 재시작됐다."**
1. `logs/mcp-crash-YYYY-MM-DD.log` 열기 → fatal 만 있음
2. `msg` 별로 원인 확인 (`http_server_error` = 포트 바인딩, `uncaught_exception` = 예상 못한 오류)

**"특정 요청 flow 를 추적하고 싶다."**
`traceId` 로 필터. 요청 한 건에 대한 `tool_call` (+ 관련 sdk_error 등) 모두 같은 traceId.
