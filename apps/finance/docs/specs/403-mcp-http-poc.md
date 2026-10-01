# Phase 32-A — MCP HTTP transport PoC

- **작성일**: 2026-07-06
- **참조**: [402-milestone-14-master.md](./402-milestone-14-master.md)
- **선행 이슈**: 없음 (실험 검증)

## 1. 목적

Claude Code CLI 가 `mcp-config.json` 의 HTTP URL 방식으로 실제 MCP 서버에 붙어 tool 호출 성공하는지 로컬에서 검증. 결과에 따라 32-B (PM2 승격) 진행 여부 결정.

## 2. 검증 방법

- [ ] 실험 브랜치 `poc/403-mcp-http` 에서만 작업 (main/dev 오염 X)
- [ ] `src/mcp/server-http.ts` 임시 생성 — `StreamableHTTPServerTransport` 사용, 로컬 4200 포트 bind
- [ ] `mcp-config.http.json` 신규 — `{"mcpServers":{"myfinance":{"type":"http","url":"http://127.0.0.1:4200/mcp"}}}`
- [ ] 로컬 실행:
  ```bash
  # 1. HTTP MCP 서버 기동
  npx tsx src/mcp/server-http.ts

  # 2. 다른 터미널에서 Claude CLI 호출
  claude -p "포트폴리오 알려줘" \
    --mcp-config src/lib/ai/mcp-config.http.json \
    --strict-mcp-config \
    --allowedTools "mcp__myfinance__get_portfolio" \
    --permission-mode dontAsk
  ```
- [ ] 성공 기준:
  - Claude CLI 가 서버에 붙음 (서버 로그에서 request 확인)
  - tool 호출 성공 응답
  - stdio 방식 대비 응답 시간이 비슷하거나 빠름
- [ ] 실패 기준:
  - Claude CLI 가 URL 을 파싱 못 하거나 지원 안 함
  - 프로토콜 버전 불일치
  - 응답 없음

## 3. 결과 문서화

- [ ] 성공 시: 재현 명령 + latency 비교 (stdio vs http) → 32-B 진행 승인
- [ ] 실패 시: 에러 원인 + Claude CLI 지원 현황 → 대체안 A (파일 로거만) 결정

## 4. 파일 (실험용, 나중에 정리)

- `src/mcp/server-http.ts` (임시)
- `src/lib/ai/mcp-config.http.json` (임시)
- `docs/specs/403-mcp-http-poc-result.md` (결과 기록)

**PoC 성공 후 위 임시 파일은 32-B 에서 정식 파일로 대체하며 정리.**

## 5. 시간 목표

반나절. 실패 시 즉시 결정 (오래 붙들지 말 것).

## 6. 완료 시

결과에 따라 32-B 진로 (성공) 또는 대체안 (실패) 선택.
