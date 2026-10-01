# 아이별 통합 증여 현황

## 목적

세금 페이지에서 주식+비주식 증여를 합산하여 아이별 통합 증여 현황 표시.
현재 주식 계좌 Deposit만 집계하여 비주식 자산 증여가 누락.

## 요구사항

- [ ] 세금 페이지 증여 데이터: 비주식 Asset Deposit도 합산
- [ ] GiftTaxGauge: 주식/비주식 분리 표시 (accountGifted/assetGifted)
- [ ] 기존 증여 현황 회귀 없음

## 기술 설계

### 변경 파일

1. **`src/app/tax/page.tsx`** — 비주식 Deposit 합산 (API와 동일 로직)
2. **`src/components/tax/GiftTaxGauge.tsx`** — 주식/비주식 분리 표시

## 테스트 계획

- [ ] 세금 페이지 증여 현황 → 비주식 포함 합산
- [ ] GiftTaxGauge에 주식/비주식 분리 표시
- [ ] lint + typecheck + build 통과
