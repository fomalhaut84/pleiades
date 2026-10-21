# 14차 마일스톤 — MCP 인프라 격상 + 관측 개선 (마스터)

- **작성일**: 2026-07-06
- **타입**: 마일스톤 (마스터 스펙, sub-phase 로 분할 진행)
- **참조**: 13차 마스터 #395, `memory/project_next_milestone_14.md`

## 1. 배경

현재 MCP 서버는 stdio transport 방식으로 Claude CLI 가 **매 세션마다 subprocess 로 spawn/kill** 하는 구조. 결과적으로:

1. **로그 소실** — 세션 종료 시 stderr 도 함께 사라짐. 어떤 tool 호출에서 오류가 났는지 사후 추적 어려움 (사용자 명시 pain)
2. **cold-start 반복** — 매 askAdvisor 호출마다 esbuild bundle 로드 + Prisma client init
3. **커넥션 pool 낭비** — 세션마다 새 Prisma 커넥션 스폰
4. **크래시 원인 소실** — 짧게 살다 죽으니 실패한 tool 이 남긴 stack trace 를 다음 호출에서 확인 못 함

MCP SDK 1.27.1 은 `StreamableHTTPServerTransport` 를 정식 지원하므로 PM2 프로세스로 승격 가능. Claude CLI 도 `mcp-config.json` 에서 `{"type":"http","url":"..."}` 를 지원.

## 2. 목표

14차 종료 시:
- ✅ MCP 서버가 별도 PM2 프로세스 (`myfinance-mcp`) 로 상시 상주
- ✅ Claude CLI 가 로컬 HTTP endpoint (`127.0.0.1:<port>/mcp`) 로 연결
- ✅ MCP tool 호출 로그가 파일에 남아 사후 추적 가능 (`pm2 logs myfinance-mcp`)
- ✅ 크래시 시 PM2 auto-restart + 로그 잔존
- ✅ cold-start / Prisma 커넥션 재사용 개선

## 3. Sub-Phase 분할

### Phase 32-A: HTTP transport PoC (선행 검증)

**목적**: Claude CLI 가 실제로 HTTP MCP transport 로 tool 호출 성공하는지 로컬에서 검증. 실패 시 옵션 A (파일 로거만) 로 회귀 결정.

- [ ] MCP server 를 임시로 `StreamableHTTPServerTransport` 로 스위치 (실험 브랜치)
- [ ] 로컬 4200 포트 bind
- [ ] `mcp-config.json` 을 `{"type":"http","url":"http://127.0.0.1:4200/mcp"}` 로 변경
- [ ] Claude CLI 로 실제 tool 호출 (`claude -p --mcp-config ... 포트폴리오 알려줘`) 성공 확인
- [ ] 성공 시 32-B/C 진행, 실패 시 근본 원인 진단 → 대체안 (A) 결정

**노력**: XS (반나절)

### Phase 32-B: MCP server HTTP transport + PM2 승격

**목적**: 프로덕션 MCP 프로세스 분리.

- [ ] MCP server 코드에 HTTP transport 정식 도입 (환경변수로 stdio/http 전환 가능하게)
- [ ] esbuild 스크립트 (`build:mcp`) 갱신 — HTTP 의존성 (express or fetch) 포함
- [ ] `ecosystem.config.js` 에 `myfinance-mcp` 앱 추가:
  - port env var
  - max_memory_restart / autorestart / min_uptime / exp_backoff_restart_delay
- [ ] `mcp-config.json` 을 URL 방식으로 최종 변경
- [ ] `deploy/deploy.sh` 갱신 — `pm2 reload myfinance-mcp` 포함
- [ ] 로컬 3 프로세스 (web + bot + mcp) 병행 실행 검증
- [ ] Health check endpoint (`GET /health`) — 배포 후 curl 검증용

**노력**: 중 (1~2일)

### Phase 32-C: 구조화 로깅

**목적**: 오류 사후 추적 가능하도록.

- [ ] pino or winston 도입 (경량 우선 pino)
- [ ] 각 tool 호출 로그: timestamp / tool_name / args_summary / latency_ms / status(ok|error) / error_detail
- [ ] 로그 rotation 정책 (일별, 최근 14일 보관)
- [ ] 매 crash 시 stack trace 파일 저장
- [ ] `pm2 logs myfinance-mcp` 뿐 아니라 `~/logs/mcp/mcp-YYYY-MM-DD.log` 도 병존
- [ ] 로컬 스모크 테스트

**노력**: 소 (반나절)

## 4. 진행 순서

1. **32-A PoC** — 실패 시 대안 조기 결정 (sunk cost 방지)
2. **32-B PM2 승격** — 정식 인프라 전환
3. **32-C 로깅** — 사용자 pain 최종 해소

## 5. 성공 지표

- 봇 세션 중 MCP tool 오류 발생 시 `pm2 logs myfinance-mcp` 로 즉시 원인 파악 가능
- MCP tool 호출 latency 로그로 병목 tool 파악 가능
- Prisma 커넥션 pool 안정화 (재사용률 관찰)
- 3 프로세스 (web + bot + mcp) 안정 운영, 서로 격리 (한 프로세스 크래시가 다른 프로세스 영향 없음)

## 6. 리스크 & 완화

- **Claude CLI HTTP MCP 미지원 위험** → 32-A PoC 로 사전 검증. 실패 시 대체안 (A. 파일 로거만) 로 회귀.
- **포트 충돌** → 로컬 127.0.0.1 bind + 방화벽으로 외부 노출 X. 포트 (4200) 는 환경변수로 관리.
- **인증 부재** → localhost bind 로 완화. 향후 다중 사용자 지원 시 secret header 도입 검토 (v2 후보).
- **배포 스크립트 갱신 실수** → 로컬에서 3 프로세스 병행 반드시 검증 후 배포. Health check 로 확인.

## 7. 제외 (v2 후보)

- MCP 서버 다중 인스턴스 / 로드 밸런싱 — 사용량 낮아 불필요
- 인증 헤더 / API key — localhost bind 로 대체
- MCP tool 별 rate limiting
- 원격 관측 스택 (Grafana / Loki) — pino 로그 파일로 충분

## 8. 참고

- MCP SDK 1.27.1 `dist/esm/server/streamableHttp.js` — HTTP transport
- 현재 stdio 구조: `src/mcp/server.ts`, `src/lib/ai/mcp-config.json`, `src/lib/ai/claude-advisor.ts`
- 기존 PM2 config 패턴: `ecosystem.config.js` (myfinance / myfinance-bot 참고)
