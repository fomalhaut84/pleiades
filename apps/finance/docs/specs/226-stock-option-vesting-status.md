# 스톡옵션 베스팅 상태 관리

## 목적

스톡옵션 베스팅일 도래 시 상태를 자동으로 전환하고,
웹 UI에서 수동으로 상태를 변경(행사 처리 등)할 수 있도록 기능 추가.

현재 문제: 베스팅일이 지났는데 status가 "pending"으로 남아있음.
상태 변경 API도 없고, 자동 전환 로직도 없음.

## 요구사항

### A. 자동 상태 전환 (cron)
- [ ] 매일 실행: pending + vestingDate <= today → "exercisable"로 전환
- [ ] 매일 실행: exercisable + StockOption.expiryDate < today → "expired"로 전환
- [ ] standalone 봇 프로세스의 cron에 등록

### B. 상태 변경 API
- [ ] PATCH /api/stock-options/[id]/vestings/[vestingId]
- [ ] 허용 상태 전환: exercisable → exercised, 수동 expired 처리
- [ ] exercised 시 StockOption.exercisedShares 업데이트 (트랜잭션)

### C. 웹 UI
- [ ] 스톡옵션 대시보드 베스팅 행에 상태 변경 버튼
- [ ] "행사 가능" → "행사 완료" 버튼
- [ ] 상태 뱃지 색상은 기존 그대로 (green/blue/red/yellow)

## 기술 설계

### 변경 파일

1. **`src/lib/cron.ts`** — `scheduleVestingStatusUpdate` 함수 추가
2. **`src/bot/standalone.ts`** — cron 등록 호출 추가
3. **`src/app/api/stock-options/[id]/vestings/[vestingId]/route.ts`** (신규) — PATCH API
4. **`src/components/stock-option/StockOptionDashboard.tsx`** — 상태 변경 버튼 추가

## 테스트 계획

- [ ] cron 실행 → pending 건이 exercisable로 전환
- [ ] 웹에서 "행사 완료" 클릭 → status 변경 + exercisedShares 업데이트
- [ ] lint + typecheck + build 통과

## 제외 사항

- 스톡옵션 CRUD(생성/삭제) 변경 없음
- RSU 상태 관리는 별도 이슈
