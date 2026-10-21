# [Fix] 시간외/장 시작 전 상태에서 정규장 시세에 시간외 라벨이 붙는 문제

- **이슈**: #506 (출처: Codex P2 · myFinance#505 · fomalhaut84/pleiades#71)
- **작성일**: 2026-10-19
- **타입**: 버그
- **노력 예상**: XS
- **우선순위**: P2 (Codex)

## 1. 문제

`fetchQuote()` 는 장 상태와 무관하게 `regularMarketPrice`·`regularMarketTime` 을 반환한다. 그런데 MCP
`get_prices` 의 시세 기준 표기 (`formatMarketStamp`, `src/mcp/utils.ts`) 는 `marketState` 라벨을 그 값의
수식어처럼 붙여 `… 05:00 KST (시간외)` 로 출력했다 → 정규장 종가가 시간외 시세처럼 읽힌다.
PRE/PREPRE 도 같은 구조 (전일 정규장 종가에 `(프리마켓)`).

## 2. 수정

값의 정체와 현재 장 상태를 분리한다 (Codex 제안 중 "marketState 를 별도의 현재 장 상태로 표시").

| marketState | 표기 |
|---|---|
| REGULAR | `(장중)` — 값이 곧 현재 장 시세 |
| CLOSED | `(마감)` |
| PRE / PREPRE / POST / POSTPOST | `(정규장 종가 · 현재 {장 상태})` — 장 상태 라벨은 #500 시장별 분기 유지 (US POST = 시간외) |
| 미지 값 | `(정규장 종가 · 현재 {원문})` |

- [x] `marketStampQualifier()` 도입, `formatMarketStamp` 가 사용
- [x] 회귀 테스트: PRE/PREPRE/POST/POSTPOST 에서 `KST (시간외|프리마켓|…)` 직결 표기 금지, REGULAR/CLOSED 는 라벨만

## 3. 제외

- 프리/애프터마켓 가격 필드 (`postMarketPrice` 등) 채택 — 클로징 리뷰는 정규장 종가가 기준이라 값은 유지.
  시간외 가격 병기는 필요 시 별도 이슈
- 텔레그램 `/주가` 표기 (marketState 미사용)
