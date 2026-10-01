# Phase 25-D: USD 거래/배당 환율 검증 강화

## 목적

USD 통화 거래/배당의 환율 검증을 일관되게 강화한다. 특히 **편집 경로(PUT)에서 환율 미지정 시 기존 값이 손상돼 있으면 `totalKRW = 0`이 되는** 잠재적 데이터 손상 경로를 차단한다.

## 배경

검토 결과:
- 생성 경로(POST): trade(`trade-utils.ts:128`), dividend(`dividend-utils.ts:43`) 모두 `currency === 'USD' && fxRate <= 0` 거부 — 안전
- 배당 편집 경로(`dividends/[id]/route.ts:59`): 최종 적용값을 한 번 더 검증 — 안전
- **거래 편집 경로(`trades/[id]/route.ts:71`)**: `fxRate !== undefined` 일 때만 검증. `fxRate` 미지정으로 PUT 보내면 line 86이 `trade.fxRate`로 fallback. 만약 stored `trade.fxRate`가 어떤 이유로 null/0이면, line 88에서 `updatedFxRate ?? 0`이 적용되어 `totalKRW = 0`으로 silently 저장됨

## 요구사항

- [ ] `validateFxRateForUSD(fxRate)` 공용 헬퍼 추출 (`trade-utils.ts`)
- [ ] 거래 편집 PUT: 최종 적용 fxRate가 USD인 경우 항상 양수 보장
- [ ] 배당 편집 PUT: 기존 검증 유지(이미 안전), 동일 헬퍼로 코드 일관성
- [ ] totalKRW = 0 silent 저장 차단 (USD인데 환율 미존재 시 400 응답)

## 기술 설계

### 변경 파일

| 파일 | 변경 |
|---|---|
| `src/lib/trade-utils.ts` | `validateFxRateForUSD(fxRate): string \| null` 헬퍼 export |
| `src/app/api/trades/[id]/route.ts` | 최종 `updatedFxRate` 검증을 PUT 끝부분에 추가 |

### 헬퍼 시그니처

```ts
/** USD 거래/배당의 환율을 검증. 통과 시 null, 실패 시 사용자 메시지. */
export function validateFxRateForUSD(fxRate: unknown): string | null {
  if (typeof fxRate !== 'number' || !Number.isFinite(fxRate) || fxRate <= 0) {
    return 'USD 종목은 유효한 환율이 필요합니다.'
  }
  return null
}
```

### 거동 변화

- 생성: 기존 동작 유지 (이미 안전)
- 거래 편집: USD 거래에 fxRate 누락 + stored 값 손상 시 → 400 응답
- 배당 편집: 기존 동작 유지 (이미 안전)
- `recalcHoldingFromTrades`가 정상 fxRate로만 trigger되므로 holdings 평단 왜곡 추가 차단

## 테스트 계획

- [ ] `npm run lint`
- [ ] `npx tsc --noEmit`
- [ ] `npm run build`
- [ ] 수동:
  - USD 거래에 `fxRate: null` PUT → 400
  - 손상된 stored fxRate=null인 USD 거래에 shares만 PUT → 400 (silent 0 저장 방지)

## 제외 사항

- 환율 자동 적용 (현재 시세) — 별도 feature (UX 개선 후보), 25-D 범위 외
- KRW 거래의 fxRate 처리(항상 null) — 변경 없음
- Asset 입금/이체의 환율 — 25-D 범위 외 (별도 점검)

## 라벨

- `fix`, `P1`, `phase-25`
