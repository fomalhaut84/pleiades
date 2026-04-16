# 구현 계획: 보유 종목 전략 설정 MCP 도구 (#267)

## 변경 파일 (4개)

| 순서 | 파일 | 변경 |
|------|------|------|
| 1 | `src/mcp/tools/strategy.ts` | setHoldingStrategy 함수 추가 |
| 2 | `src/mcp/server.ts` | set_holding_strategy 도구 등록 |
| 3 | `src/lib/ai/claude-advisor.ts` | ALLOWED_TOOLS 추가 |
| 4 | `src/lib/ai/system-prompt.ts` | 도구 목록 추가 |

## 핵심 로직

1. ticker로 holdings 조회 (account_name 있으면 필터)
2. 0건 → 에러
3. 2건 이상 & account_name 없음 → 에러 ("계좌 명시 필요")
4. 1건 → HoldingStrategy upsert (holdingId 기준)
5. entryLow > entryHigh 검증
6. reviewDate는 YYYY-MM-DD 문자열 → Date 변환

## 패키지/DB 변경: 없음
