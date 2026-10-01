# Phase 24-A: 자산 + 자산 입금 CRUD MCP 도구

## 목적

AI가 비주식 자산(적금/입출금 등)과 자산 입금(증여 추적)을 직접 관리 가능.

## 요구사항

- [ ] `list_assets`: 자산 목록 + 기본 메타 조회 (name 기반 식별을 위해)
- [ ] `create_asset`: name, category, owner, value, isLiability?, interestRate?, maturityDate?, note?
- [ ] `update_asset`: name으로 식별 + 부분 수정
- [ ] `delete_asset`: name으로 삭제 (연결 데이터 체크)
- [ ] `create_asset_deposit`: assetName, amount, source, depositedAt?, note? → Asset.value 트랜잭션 업데이트

## 기술 설계

### 변경 파일

1. `src/mcp/tools/asset.ts` (신규)
2. `src/mcp/server.ts` — 5개 도구 등록
3. `src/lib/ai/claude-advisor.ts`, `system-prompt.ts` 반영

### 안전장치

- 자산 삭제 시 연결 거래(transactions)/입금(deposits) 있으면 거부
- create_asset_deposit은 Prisma $transaction으로 Deposit 생성 + Asset.value 증감 원자 실행
- 다중 동명 자산 → exact match fallback → 불가 시 에러
