# Phase 25-B: 보유종목 dropdown 필터링 (shares > 0)

## 목적

거래/배당 입력 폼에서 보여주는 보유종목 dropdown을 현재 보유 중인 종목(`shares > 0`)으로만 필터링한다. 시드/임포트/예외 경로에서 들어온 0주(또는 음수) 보유 행이 dropdown에 나타나 사용자 혼란을 일으키는 문제를 차단한다.

## 배경

사용자 보고 (Phase 25-A 조사 시): "새 거래 > 세진 > 매수를 선택해서 보면 종목에 보유종목이 잘 안 나오는 부분도 있고…"

조사 결과:
- `trade-service.ts`는 매도 후 잔량 0이 되면 `deleteMany`로 정리하지만, 시드/임포트/외부 경로로 들어온 0주 행은 잔존 가능
- `tax/page.tsx:152`만 `shares: { gt: 0 }` 필터를 적용 중. 다른 곳은 누락
- 영향: `trades/new`, `dividends/new` 모두

## 요구사항

- [ ] `src/app/trades/new/page.tsx`의 holdings 조회에 `shares > 0` 필터 추가
- [ ] `src/app/dividends/new/page.tsx`의 holdings 조회에 `shares > 0` 필터 추가
- [ ] 정렬은 기존 `displayName: 'asc'` 유지

## 비대상 (변경 없음)

- 대시보드 / 계좌 상세 / 포트폴리오 표시는 그대로 — 일시적 잔량 변화 확인용이라 필터 안 함
- API `/api/accounts`: 외부 노출용 공통 API이므로 필터를 강제하지 않음 (호출 측에서 결정)
- 봇 명령: 별도 흐름이므로 이번 범위 외 (필요 시 별도 이슈)
- 자산 직접 입력(수동 입력 모드)는 그대로 유지 — 신규 종목 등록 가능

## 기술 설계

### 변경 파일

| 파일 | 변경 |
|---|---|
| `src/app/trades/new/page.tsx` | `holdings: { where: { shares: { gt: 0 } }, select: {...}, orderBy: {...} }` |
| `src/app/dividends/new/page.tsx` | 동일 패턴 |

### 거동

- 현재 보유 중인 종목만 dropdown에 표시
- 모두 매도해 잔량이 0이거나 0행이 잔존한 종목은 표시 안 됨
- "직접 입력" 옵션으로 historical/예외 거래는 계속 입력 가능

## 테스트 계획

- [ ] `npm run lint`
- [ ] `npx tsc --noEmit`
- [ ] `npm run build`
- [ ] 수동: 새 거래 페이지에서 보유종목 dropdown 정상 표시 확인

## 제외 사항

- 0주 행이 발생하는 근본 원인(seed/import) 추적은 별도 이슈
- 매도 후 자동 정리되는 trade-service 흐름은 변경 없음

## 라벨

- `fix`, `P1`, `phase-25`
