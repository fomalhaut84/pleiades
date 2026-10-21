# MCP: RSU + 스톡옵션 조회 도구

## 목적

AI 어드바이저가 RSU 베스팅 일정과 스톡옵션 현황을 조회할 수 있도록 MCP 도구 추가.
현재 AI는 RSU/스톡옵션 데이터에 접근 불가하여 "다음 베스팅 언제?", "행사가능 옵션?" 등의 질의에 답할 수 없음.

## 요구사항

- [ ] `get_rsu_schedule` MCP 도구: 계좌별 RSU 베스팅 일정 조회
- [ ] `get_stock_options` MCP 도구: 스톡옵션 + 베스팅 일정 조회
- [ ] MCP server.ts에 도구 등록
- [ ] build:mcp + build:bot 정상 빌드

## 기술 설계

### 신규 파일

**`src/mcp/tools/rsu-options.ts`**

#### get_rsu_schedule
- 파라미터: `account_name` (세진/소담/다솜/전체, 선택)
- 반환: RSUSchedule 목록 (계좌명, 베스팅일, 주수, 기준가, 상태, 메모)
- DB: `RSUSchedule` + `Account` join

#### get_stock_options
- 파라미터: `account_name` (세진/소담/다솜/전체, 선택)
- 반환: StockOption 목록 + 각 옵션의 StockOptionVesting 일정
  - 옵션: 종목, 부여일, 만료일, 행사가, 총수량, 행사/취소/잔여 수량
  - 베스팅: 행사가능일, 수량, 상태

### 수정 파일

**`src/mcp/server.ts`** — 도구 등록 (import + server.tool 호출)

## 테스트 계획

- [ ] AI에게 "RSU 일정 알려줘" → RSU 베스팅 일정 응답
- [ ] AI에게 "스톡옵션 현황" → 스톡옵션 + 베스팅 일정 응답
- [ ] lint + typecheck + build 통과

## 제외 사항

- 웹 UI 변경 없음
- 봇 커맨드 변경 없음
- RSU/스톡옵션 CRUD 변경 없음
