# Phase 4: Tax Center — 구현 계획 (사후 기록)

## 서브 이슈
- #19: 4-A Deposit CRUD — 입금/증여 기록
- #20: 4-B 증여세 대시보드 — 한도 게이지 + 10년 리셋
- #21: 4-C 양도소득세 계산기 — 해외주식 + 국내 ETF
- #22: 4-D RSU 근로소득세 예상
- #23: 4-E 매도 전 세금 미리보기
- #24: 4-F 배당소득세 추적 — Phase 3-E 연계

## 주요 변경 파일
```
신규:
  prisma/migrations/ — Deposit 모델
  src/app/api/deposits/ — CRUD API
  src/app/deposits/ — 입금/증여 페이지
  src/lib/tax/ — 세금 계산 로직 (gift-tax, capital-gains, rsu-tax)
  src/app/tax/ — 세금 대시보드 페이지
  src/components/tax/ — 증여세 게이지, 양도세 계산기, 미리보기
```

## DB 마이그레이션
- Deposit 모델 추가

## 구현 순서
1. Deposit 모델 + CRUD API
2. 증여세 계산 로직 + 대시보드
3. 양도소득세 계산기 (해외주식 250만 공제 + 22%, 국내 ETF 15.4%)
4. RSU 근로소득세 예상
5. 매도 전 세금 미리보기
6. 배당소득세 추적 (금융소득종합과세 모니터링)
