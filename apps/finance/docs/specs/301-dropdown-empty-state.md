# [Phase 25-G-1] 거래/배당 새 입력 — 종목 선택 빈 상태 안내

## 목적

`/trades/new` 와 `/dividends/new` 에서 종목 dropdown 이 비어지거나 비활성 상태일 때 사용자에게 다음 액션을 명확히 안내한다. 25-B 에서 `shares > 0` 필터를 적용한 결과 보유 종목이 없는 계좌를 선택하면 dropdown 이 사라지고 manual 입력으로 묵묵히 전환되어 사용자가 상황을 인지하기 어렵다.

## 배경

현재 양식 거동 (TradeForm.tsx / DividendForm.tsx 동일 패턴):

| 상태 | 현 거동 | 문제 |
|---|---|---|
| 계좌 미선택 | 종목 라벨만 있고 입력 영역 비어있음 | "왜 입력 못함?" 사용자가 추측해야 함 |
| 계좌 선택 + holdings=0 + BUY | manual input 곧장 활성화 (티커/종목명/시장/통화) | "이 계좌에 보유 종목이 없어서" 인지 부재 |
| 계좌 선택 + holdings=0 + SELL (trade only) | manual input 활성화 → 매도 시도 가능 | 서버에서 `보유 수량 부족` 에러로 실패. 폼 진입 자체가 모순 |
| 계좌 선택 + holdings>0 | select dropdown + "직접 입력" 옵션 | 정상 |

## 요구사항

- [ ] 계좌 미선택 상태: dropdown 자리에 `"계좌를 먼저 선택하세요"` 안내. 입력 영역 모두 비활성.
- [ ] 계좌 + holdings=0 + BUY: manual input 위에 `"이 계좌에 보유 종목이 없습니다. 첫 매수로 직접 입력해주세요."` 안내. manual input 유지.
- [ ] 계좌 + holdings=0 + SELL (TradeForm 만): 폼 본문 대신 안내 박스만 표시. `"매도할 보유 종목이 없습니다."` + `"매수로 전환"` 버튼 또는 다른 계좌 안내.
- [ ] 계좌 + holdings>0: 현 거동 유지 (회귀 없음).
- [ ] DividendForm 은 SELL 분기 없음 → 위 1·2번만 적용.
- [ ] 안내 박스는 기존 디자인 시스템 컬러/타이포 따름 (`text-sub`, `border-border`, `bg-surface-dim` 등).

## 기술 설계

### 1. 분기 추가 (TradeForm.tsx)

기존 종목 입력 영역 (line 218~306) 을 다음 분기 트리로 재구성:

```tsx
{/* 종목 선택 */}
<div>
  <label className={labelClasses}>종목</label>

  {!accountId && (
    <EmptyHint message="계좌를 먼저 선택하세요." />
  )}

  {accountId && holdings.length === 0 && tradeType === 'SELL' && (
    <NoHoldingsForSell onSwitchToBuy={() => setTradeType('BUY')} />
  )}

  {accountId && holdings.length === 0 && tradeType === 'BUY' && (
    <>
      <EmptyHint message="이 계좌에 보유 종목이 없습니다. 첫 매수로 직접 입력해주세요." />
      <ManualTickerInput ... />
    </>
  )}

  {accountId && holdings.length > 0 && (
    <SelectOrManualDropdown ... />
  )}
</div>
```

소형 presentational 컴포넌트 (`EmptyHint`, `NoHoldingsForSell`) 는 TradeForm.tsx 내부에 함수형으로 두고, manual input / select dropdown 은 기존 JSX 를 그대로 유지하되 분기 안으로 이동.

### 2. SELL + holdings=0 시 제출 가드

`handleSubmit` 진입부에 동일 분기 가드 추가:
```ts
if (tradeType === 'SELL' && holdings.length === 0) {
  setError('이 계좌에는 매도할 보유 종목이 없습니다.')
  return
}
```
(사용자가 폼 본문을 우회해 직접 POST 보내는 경우 대비)

### 3. DividendForm.tsx 동일 패턴

SELL 분기 제외하고 EmptyHint / ManualInput / SelectDropdown 트리만 적용.

### 4. 안내 박스 스타일

```
bg-surface-dim border border-border rounded-lg px-4 py-3 text-[13px] text-sub
```
기존 양식의 inputClasses 와 같은 corner-radius / 컬러 톤. 별도 컴포넌트 분리 안 함 (G-1 단독 사용).

## 테스트 계획

- 계좌 미선택 → "계좌를 먼저 선택하세요" 안내 표시 확인
- 보유 종목 없는 계좌 + BUY → 안내 + manual input 노출, 정상 제출
- 보유 종목 없는 계좌 + SELL → 안내 박스만 표시, 제출 버튼 비활성
- 보유 종목 있는 계좌 → 회귀 없음 (dropdown + 직접 입력 옵션)
- 계좌 ↔ 유형 토글 시 안내가 즉시 갱신
- 배당 양식도 위 1·2 동일 회귀
- `npm run lint && npx tsc --noEmit && npm run test:run && npm run build`

## 제외 사항

- 안내 박스를 공통 컴포넌트로 분리 — 25-G-2/G-3 도 안내 박스를 쓸 경우 그때 통합
- 계좌 선택 UI 자체 개편 — 별도 phase
- "다른 계좌로 전환" 버튼 — 다중 계좌 컨텍스트 전환은 별도 흐름이라 G-1 범위 밖
