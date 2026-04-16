# Phase 24-C: RSU + 스톡옵션 관리 MCP 도구

## 목적

AI가 RSU 베스팅 일정과 스톡옵션 + 행사 스케줄을 직접 관리할 수 있도록 MCP 쓰기 도구 추가.

## 요구사항

### RSU 스케줄 (3개)

- [ ] `create_rsu_schedule`: 신규 RSU 베스팅 일정 등록
  - 입력: account_name, vestingDate(YYYY-MM-DD), shares, basisValue, basisDate?, basisPrice?, sellShares?, keepShares?, note?
  - 검증: shares ≥ 1, basisValue ≥ 0, sellShares/keepShares ≤ shares
- [ ] `update_rsu_schedule`: 수정 (pending 상태만 허용)
  - 입력: id, vestingDate?, shares?, basisValue?, basisDate?, basisPrice?, sellShares?, keepShares?, note?
  - 검증: existing.status === 'pending'
- [ ] `delete_rsu_schedule`: 삭제 (pending 상태만 허용)

### 스톡옵션 (3개)

- [ ] `create_stock_option`: 신규 스톡옵션 등록
  - 입력: account_name, ticker, displayName, grantDate, expiryDate, strikePrice, totalShares, note?
  - 초기값: cancelledShares=0, exercisedShares=0, adjustedShares=0, remainingShares=totalShares
- [ ] `update_stock_option`: 수정
  - 입력: id, ticker?, displayName?, grantDate?, expiryDate?, strikePrice?, totalShares?, cancelledShares?, adjustedShares?, note?
  - 재계산: remainingShares = totalShares − cancelledShares − exercisedShares − adjustedShares
- [ ] `delete_stock_option`: 삭제 (vestings cascade)

### 스톡옵션 베스팅 스케줄 (3개)

- [ ] `create_stock_option_vesting`: 행사 스케줄 추가
  - 입력: stockOptionId, vestingDate, shares, note?
- [ ] `update_stock_option_vesting`: 수정 (vestingDate?, shares?, note?)
- [ ] `delete_stock_option_vesting`: 삭제

### 베스팅 상태 전환 (1개)

- [ ] `exercise_vesting`: 베스팅 상태 전환
  - 입력: vestingId, action: "activate" | "exercise" | "expire"
  - activate: pending → exercisable (베스팅일 도래 검증, KST 일 단위)
  - exercise: exercisable → exercised (StockOption.exercisedShares 증가, remainingShares 감소)
  - expire: exercisable → expired

## 기술 설계

### 변경 파일

1. `src/mcp/tools/rsu-write.ts` (신규)
2. `src/mcp/tools/stock-option-write.ts` (신규)
3. `src/mcp/server.ts` — 10개 도구 등록
4. `src/lib/ai/claude-advisor.ts` ALLOWED_TOOLS 확장
5. `src/lib/ai/system-prompt.ts` 설명 추가

### 안전장치

- RSU: status='pending'만 수정/삭제 (기존 API와 동일)
- 스톡옵션 수정 시 remainingShares 자동 재계산
- exercise_vesting 액션은 `ALLOWED_TRANSITIONS` 화이트리스트 체크
- exercised 전환은 Serializable 트랜잭션 + 조건부 업데이트 (중복 방지)
- 날짜는 YYYY-MM-DD 엄격 파싱
- accountId는 account_name으로 매칭 (resolveAccountId 재사용)

### 제외 사항

- `vest_rsu` (Trade/Holding 자동 생성) — Phase 24-D로 분리
- 사유: Trade/Holding 연동은 위험도가 높고, 현재 UI에서도 명시적 vest 버튼으로만 처리
