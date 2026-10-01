# Phase 9: Claude AI 어드바이저 — 구현 계획 (사후 기록)

## 서브 이슈
- #91/96: 9-A MCP 서버 구현
- #92/98: 9-B Claude Code CLI 래퍼 + 시스템 프롬프트
- #93/100: 9-C 텔레그램 AI 질문 연동
- #94/103: 9-D 웹 AI 분석 페이지
- #95: 9-E 자연어 거래 입력 파싱
- #102: 9-F 텔레그램 AI 응답 포맷 개선

## 주요 변경 파일
```
신규:
  src/mcp/ — MCP 서버 (server.ts, tools/)
  src/lib/ai/ — claude-advisor.ts, system-prompt.ts, mcp-config.json
  src/app/api/ai/ — AI 질문 API
  src/app/ai/ — 웹 AI 분석 페이지
  src/bot/commands/ai.ts — /ai 커맨드 + 자연어 fallback
  src/bot/utils/ai-format.ts — AI 응답 텔레그램 포맷
```

## 패키지 추가
- @modelcontextprotocol/sdk, esbuild (MCP 번들)

## DB 마이그레이션
없음

## 구현 순서
1. MCP 서버 (9개 도구: 포트폴리오, 세금, 소비, 시뮬레이션, 시세)
2. Claude Code CLI 래퍼 (spawn shell, 시스템 프롬프트)
3. 텔레그램 /ai 커맨드 + 자연어 fallback
4. 웹 AI 분석 페이지 (채팅 UI + 프리셋)
5. 자연어 거래 입력 파싱 (AI → 확인 키보드)
6. 텔레그램 AI 응답 포맷 개선 (표→리스트, HTML parse_mode)
