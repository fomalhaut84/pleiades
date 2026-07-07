# Phase 32-C — MCP 구조화 로깅

- **작성일**: 2026-07-06
- **참조**: [402-milestone-14-master.md](./402-milestone-14-master.md)
- **선행 이슈**: #404 (PM2 승격) 완료 후 진행

## 1. 목적

MCP tool 호출을 구조화 로그로 남겨 사후 문제 추적을 가능하게. 사용자 명시 pain 최종 해소.

## 2. 요구사항

- [ ] pino 도입 (경량 + 빠름, `express-pino-logger` 통합 용이)
- [ ] tool 호출 로그 스키마:
  ```json
  {
    "level": "info",
    "time": 1_720_000_000_000,
    "tool": "get_portfolio",
    "args": { "account_name": "세진" },
    "latency_ms": 42,
    "status": "ok",
    "traceId": "..."
  }
  ```
  - 에러 시 `status:"error"`, `error:{message, stack}` 필드 추가
- [ ] 로그 파일 위치: `logs/mcp-YYYY-MM-DD.log` (프로젝트 루트 하위)
- [ ] Daily rotation, 최근 14일 보관 (`pino-roll` 또는 external logrotate)
- [ ] `pm2 logs myfinance-mcp` 로도 실시간 확인 가능하게 stdout 병행 출력
- [ ] Sensitive fields (예: 사용자 이름) 은 로그에 포함 유지 (내부용, 로컬 저장이라 이슈 없음)
- [ ] 크래시 stack trace 는 별도 파일 (`logs/mcp-crash-YYYY-MM-DD.log`) 로 강제 기록

## 3. 통합 지점

`src/mcp/utils.ts` 의 `toolResult` / `toolError` 헬퍼에 로거 훅 추가:

```ts
const logger = pino({ ... })

export function toolResult(text: string, meta?: { tool: string; latency_ms: number }) {
  if (meta) logger.info({ ...meta, status: 'ok' }, 'tool_call')
  return { content: [{ type: 'text' as const, text }] }
}

export function toolError(error: unknown, meta?: { tool: string; latency_ms: number }) {
  if (meta) {
    logger.error({
      ...meta,
      status: 'error',
      error: { message: error instanceof Error ? error.message : String(error) },
    }, 'tool_call_failed')
  }
  // ... 기존 로직
}
```

각 tool 함수는 `performance.now()` 로 latency 측정 후 helper 에 넘김.

또는 **더 깔끔한 대안**: `server.tool()` 등록부에 wrapper 미들웨어 추가하여 자동 로깅.

## 4. 검증

- [ ] 로컬 스모크 — 봇에서 AI 질문 → `logs/mcp-*.log` 파일에 tool 호출 기록 확인
- [ ] 강제 크래시 유도 (invalid arg) → crash 로그 파일에 stack trace 남는지 확인
- [ ] 14일 지난 로그 rotation 확인 (mtime 조작으로 시뮬레이션)
- [ ] pm2 logs 실시간 확인
- [ ] lint / typecheck / test

## 5. 제외 (v2)

- 원격 로그 수집 (Grafana Loki 등)
- 로그 검색 UI
- 알림 스택 트레이스 통합 (텔레그램으로 크래시 알림)

## 6. 완료 시

14차 마일스톤 완결. 이후 MCP 오류 발생 시 `less logs/mcp-2026-07-06.log` 또는 `pm2 logs myfinance-mcp` 로 즉시 추적 가능.
