# Phase 32-A — MCP HTTP transport PoC 결과

- **작성일**: 2026-07-06
- **참조**: [403-mcp-http-poc.md](./403-mcp-http-poc.md)
- **결론**: ✅ **PoC 성공 — 32-B (PM2 승격) 진행**

## 1. 검증 요약

MCP SDK 1.27.1 의 `StreamableHTTPServerTransport` + multi-session 패턴으로 로컬 4200 포트에 MCP 서버를 상시 상주시키고, Claude Code CLI (v2.1.197) 가 `mcp-config.http.json` 의 `{"type":"http","url":"http://127.0.0.1:4200/mcp"}` 로 붙어 tool 호출 성공.

## 2. 재현 명령

**서버 기동**:
```bash
cd /path/to/myFinance
./node_modules/.bin/tsx src/mcp/server-http.ts
# → [mcp-poc] listening at http://127.0.0.1:4200/mcp
```

**Health check**:
```bash
curl -sS http://127.0.0.1:4200/health
# → {"ok":true,"uptime":1.94,"sessions":0}
```

**Claude CLI 로 tool 호출**:
```bash
claude -p "echo_test 툴을 호출해서 'hello' 를 보내줘" \
  --output-format json \
  --mcp-config src/lib/ai/mcp-config.http.json \
  --strict-mcp-config \
  --allowedTools "mcp__myfinance__echo_test" \
  --permission-mode bypassPermissions \
  --max-turns 5
# → is_error:false, result:"echo_test 호출 완료. 응답: `echo: hello` ✅"
```

## 3. 서버 로그 (성공 세션 flow)

```
[mcp-poc] POST /mcp method=initialize session=(new)
[mcp-poc] session initialized: a430828e-... (total=1)
[mcp-poc] initialize done in 11ms
[mcp-poc] POST /mcp method=notifications/initialized session=a430828e-...
[mcp-poc] GET  /mcp method=(no-body) session=a430828e-...   # SSE stream open
[mcp-poc] POST /mcp method=tools/list session=a430828e-...
[mcp-poc] tools/list done in 1ms
[mcp-poc] POST /mcp method=tools/call session=a430828e-...
[mcp-poc] tools/call done in 4ms
```

MCP 프로토콜 표준 flow (initialize → notifications/initialized → tools/list → tools/call) 가 정확히 관찰됨.

## 4. Latency

- 서버 처리 시간: tool call **4ms** (echo)
- Claude CLI 왕복 총 시간: **8.5초** (LLM 응답 지연이 지배적)
- stdio 대비 성능 열세 없음 (별도 프로세스 spawn 이 없어 오히려 유리)

## 5. 시행착오 기록

### 시도 1: stateful mode, 단일 transport 인스턴스
- **문제**: 첫 호출은 성공. 두 번째 initialize 시도 시 "Server already initialized" 에러.
- **원인**: 단일 transport 를 재사용하면 두 번째 initialize 를 reject.

### 시도 2: stateless mode (`sessionIdGenerator: undefined`)
- **문제**: Claude CLI 가 initialize 를 4번 반복하고 tools/list 로 진행 안 함.
- **원인**: Claude CLI 는 세션 ID 기반 stateful 을 요구하는 것으로 보임. stateless 는 curl 검증 용도로만.

### 시도 3: multi-session stateful (✅)
- **핵심**: `mcp-session-id` 헤더로 라우팅. 새 initialize 요청 → 새 transport + McpServer 인스턴스 생성. 기존 sessionId → 기존 transport 재사용.
- **결과**: Claude CLI 완벽 동작. Multi-session 이라 여러 클라이언트도 지원 가능.

## 6. 32-B 진행 시 필수 반영 사항

- **Multi-session 패턴 필수**: 단일 transport 로는 재시도/재초기화 대응 불가.
- **`onclose` 콜백에서 세션 정리**: 메모리 leak 방지.
- **세션 GC**: 오래된 세션 (예: 30분 idle) 자동 정리 필요.
- **stdio 회귀 스위치**: `MCP_TRANSPORT` 환경변수로 stdio/http 즉시 전환 가능하게 유지.

## 7. 임시 파일 (32-B 에서 정리 예정)

- `src/mcp/server-http.ts` — 실험용 서버 (echo_test + get_portfolio 2 tool)
- `src/lib/ai/mcp-config.http.json` — HTTP 방식 config

이 파일들은 32-B PR 에서 정식 통합 후 삭제 또는 대체.
