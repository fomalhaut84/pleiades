# MCP: 관심종목 조회 도구

## 목적

AI 어드바이저가 관심종목 현황을 조회할 수 있도록 MCP 도구 추가.
현재가 대비 목표 매수가/매수 구간 도달 여부를 AI가 판단하여 브리핑에 활용.

## 요구사항

- [ ] `get_watchlist` MCP 도구: 관심종목 + 현재가 + 목표가 대비 현황
- [ ] MCP server.ts에 도구 등록
- [ ] build:mcp + build:bot 정상 빌드

## 기술 설계

### 변경 파일

1. **`src/mcp/tools/watchlist.ts`** (신규)
   - Watchlist 전체 조회 + PriceCache join으로 현재가 포함
   - 각 종목: 티커, 종목명, 전략, 메모, 목표매수가, 매수구간, 현재가, 등록일
   - 현재가가 매수구간 내이면 "매수 구간 진입" 표시

2. **`src/mcp/server.ts`** — 도구 등록

## 테스트 계획

- [ ] AI에게 "관심종목 현황" → 관심종목 목록 + 현재가 응답
- [ ] lint + typecheck + build 통과

## 제외 사항

- 관심종목 CRUD 변경 없음
- 웹 UI 변경 없음
