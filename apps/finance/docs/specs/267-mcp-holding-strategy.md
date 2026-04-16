# Phase 23-B: 보유 종목 전략 설정 MCP 도구

## 목적

AI가 사용자 요청에 따라 보유 종목의 전략 태그/목표가/손절가/매수구간/메모/점검일을 설정.

## 요구사항

- [ ] `set_holding_strategy` MCP 도구: upsert (ticker + 선택적 account_name)
- [ ] 전략 태그: long_hold/swing/momentum/value/watch/scalp
- [ ] 같은 ticker를 여러 계좌가 보유할 경우 account_name으로 대상 특정 필수
- [ ] 목표가/손절가/매수구간 부분 업데이트 (null 전달 시 초기화)
- [ ] 매수 구간 검증 (entryLow <= entryHigh)
- [ ] AI ALLOWED_TOOLS + 시스템 프롬프트 반영

## 기술 설계

### 파라미터
- `ticker` (필수)
- `account_name` (선택): 여러 계좌 보유 시 대상 특정
- `strategy` (선택): 전략 태그 변경
- `targetPrice`, `stopLoss`, `entryLow`, `entryHigh`, `reviewDate`, `memo` (선택, null 허용)

### 대상 해석
1. ticker만 지정 → matching holdings 조회
2. 1건 → 해당 holding에 upsert
3. 0건 → 에러 ("보유하지 않은 종목")
4. 2건 이상 + account_name 미지정 → 에러 (계좌 명시 필요 안내)
5. account_name 지정 → 해당 계좌의 holding만 대상

### 변경 파일

1. `src/mcp/tools/strategy.ts` — setHoldingStrategy 함수 추가
2. `src/mcp/server.ts` — 도구 등록
3. `src/lib/ai/claude-advisor.ts` — ALLOWED_TOOLS
4. `src/lib/ai/system-prompt.ts` — 도구 목록

## 테스트 계획

- [ ] AI에게 "NVDA 목표가 200" → set_holding_strategy 확인 후 호출
- [ ] AI에게 "NVDA 매수구간 150~160" → entryLow/High 업데이트
- [ ] AI에게 "NVDA 점검일 2026-06-01" → reviewDate 설정
- [ ] 보유하지 않은 ticker → 에러
- [ ] 여러 계좌 보유 ticker 지정 시 → 계좌 명시 요청 에러
- [ ] lint + typecheck + build 통과
