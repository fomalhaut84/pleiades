# Phase 32-B — MCP server HTTP transport 정식 도입 + PM2 승격

- **작성일**: 2026-07-06
- **참조**: [402-milestone-14-master.md](./402-milestone-14-master.md), [403-mcp-http-poc.md](./403-mcp-http-poc.md)
- **선행 이슈**: #403 (PoC) 성공 후 진행

## 1. 목적

MCP 서버를 stdio 서브프로세스에서 상시 상주 HTTP 서버로 전환하고, PM2 앱으로 승격.

## 2. 요구사항

### MCP server 코드
- [ ] `src/mcp/server.ts` — transport 선택을 환경변수 `MCP_TRANSPORT` (`stdio` | `http`) 기반
- [ ] `http` 모드: `StreamableHTTPServerTransport` + `express` (또는 minimal http server)
- [ ] Port: `MCP_PORT` (기본 4200)
- [ ] Bind: `127.0.0.1` 만 (외부 노출 X)
- [ ] Health check: `GET /health` → `{ok:true, uptime, version}` (인증 없음)
- [ ] stdio 모드도 유지 (Claude Desktop 로컬 개발 시 편의)

### 빌드
- [ ] `build:mcp` esbuild: `--external:express` 처리, `dist/mcp/server.cjs` 유지
- [ ] 새 의존성 (express or fastify) 은 package.json dependencies 로

### PM2 설정
- [ ] `ecosystem.config.js` 에 `myfinance-mcp` 앱 추가:
  ```js
  {
    name: 'myfinance-mcp',
    script: 'dist/mcp/server.cjs',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production',
      MCP_TRANSPORT: 'http',
      MCP_PORT: '4200',
    },
    instances: 1,
    autorestart: true,
    min_uptime: 30000,
    exp_backoff_restart_delay: 100,
    max_memory_restart: '512M',
    node_args: '--max-old-space-size=512',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }
  ```

### 배포 스크립트
- [ ] `deploy/deploy.sh` 갱신 — `pm2 reload myfinance-mcp` 순서 추가
- [ ] `pm2 startup` 안내 문서 갱신 (이미 설정된 경우 자동 반영 확인)
- [ ] Rollback 안내 (문제 발생 시 이전 태그로 롤백)

### 클라이언트 설정
- [ ] `src/lib/ai/mcp-config.json` — `{"mcpServers":{"myfinance":{"type":"http","url":"http://127.0.0.1:4200/mcp"}}}`
- [ ] `claude-advisor.ts` 는 변경 최소 — `--mcp-config` 경로만 그대로 사용

### 검증
- [ ] 로컬 3 프로세스 (web + bot + mcp) 병행 실행 → 봇에서 AI 질문 → tool 호출 성공
- [ ] MCP 프로세스 kill → 자동 재시작 확인, 재시작 후 새 요청 정상 처리
- [ ] Health check curl 검증
- [ ] 부하 테스트 (연속 10회 tool 호출, latency 관찰)
- [ ] lint / typecheck / test / build

## 3. 마이그레이션 & 배포 순서

1. dev 브랜치에 머지 후 태그 릴리스 (v0.12.0 예상)
2. 서버에서 `pm2 startOrReload ecosystem.config.js` — 3 프로세스 상태 확인
3. `pm2 logs myfinance-mcp` 로 서버 로그 실시간 확인
4. 봇에서 AI 명령 e2e 검증

## 4. 리스크 & 완화

- **stdio 유지 스위치**: 문제 발생 시 환경변수로 즉시 회귀 가능
- **prisma 커넥션 폭증**: HTTP 서버가 상시 커넥션 유지 → pool size 확인, 필요 시 `datasource_url?connection_limit=N` 설정
- **포트 점유**: 4200 이 이미 사용 중이면 배포 실패 → deploy 스크립트에서 사전 체크

## 5. 완료 시

프로덕션에서 3 프로세스 상시 상주. 다음 32-C 로 로깅 정교화.
