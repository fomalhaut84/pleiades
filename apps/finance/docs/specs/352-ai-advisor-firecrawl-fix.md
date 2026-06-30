# [Fix] AI advisor: firecrawl 제거 + stderr 캡처 보강

## 목적

운영 서버에서 AI 어드바이저가 MCP 도구를 못 보고 "WebFetch/WebSearch만 사용 가능"으로 응답하는 회귀 fix.

## 원인 분석 (운영 서버 진단 결과)

- `dist/mcp/server.cjs` 정상 — JSON-RPC `tools/list` 응답에 43개 도구 모두 포함 확인
- claude CLI 도 정상 — myfinance 단독 mcp-config 로 실행 시 43개 도구 인식
- **failing combo**: myfinance + **firecrawl** 합쳐진 `mcp-config.json` + `--strict-mcp-config`
  - firecrawl 가 `npx -y firecrawl-mcp` 로 spawn 되는데 `FIRECRAWL_API_KEY` 없음 / npx 캐시 / 네트워크 / init hang 등 사유로 등록 실패
  - `--strict-mcp-config` 조합에서 한 서버 실패가 전체 MCP 도구 등록을 막는 것으로 추정

실제로 거의 안 쓰는 폴백 (WebSearch/WebFetch 가 주력 + system-prompt 에 "WebSearch 실패 시 폴백" 안내) — 제거하는 게 정합적.

부수 발견: `claude-advisor.ts:193` 의 `stdio: ['ignore', 'pipe', 'pipe']` 에서 stderr 파이프 핸들러 미등록 — claude 실패 시 정확한 사유가 PM2 로그에 안 찍힘 (큰 stderr 시 child hang 위험도). 디버깅 보강 필요.

## 요구사항

- [ ] `src/lib/ai/mcp-config.json` — `firecrawl` 블록 제거
- [ ] `src/lib/ai/claude-advisor.ts` — `ALLOWED_TOOLS` 에서 `mcp__firecrawl__firecrawl_search`, `mcp__firecrawl__firecrawl_scrape` 제거
- [ ] `src/lib/ai/system-prompt.ts` — firecrawl 폴백 안내 3줄 제거
- [ ] `src/lib/ai/claude-advisor.ts` — stderr 캡처 + `AdvisorError` 메시지에 stderr 일부 포함 (디버깅 보강)

## 배포 시 주의

- 배포 후 `pm2 restart myfinance` 만 필요 (코드 변경만, DB/스키마 영향 없음)
- 운영 서버에서 AI 질문 한 번 던져서 `mcp__myfinance__*` 도구가 실제로 호출되는지 확인 (예: "세진 계좌 포트폴리오 보여줘")
- firecrawl 가 다시 필요해지면 `FIRECRAWL_API_KEY` env 설정 후 별도 sub-config 로 추가

## 테스트 계획

- `npm run lint && npx tsc --noEmit && npm run test:run && npm run build`
- 운영 서버 수동 회귀: 위 dry-run 명령으로 `result` 안에 보유 종목 데이터 보이는지 확인

## 제외 사항

- firecrawl 도구 다시 추가 — 별도 phase
- AI advisor 전체 리팩터링
