# 비주식 자산 증여 추적

## 목적

아이들 비주식 자산(입출금, 주택청약, 적금)에 대한 입금(증여)/이체를 추적하고,
주식 계좌 증여와 합산하여 통합 증여 현황을 제공.

## 요구사항

- [ ] Deposit 모델 확장: accountId 옵셔널 + assetId 옵셔널 추가
- [ ] 자산 입금 API: Deposit 생성 + Asset.value 증가 (트랜잭션)
- [ ] 자산 간 이체 API: 출금 Deposit + 입금 Deposit + 양쪽 Asset.value 업데이트
- [ ] 자산→주식계좌 이체: Asset.value 감소 + Account Deposit 생성
- [ ] 증여세 API: 비주식 Deposit도 포함하여 owner별 합산
- [ ] 자산 관리 페이지에 입금/이체 내역 섹션

## 기술 설계

### DB 마이그레이션

```prisma
model Deposit {
  id          String   @id @default(cuid())
  accountId   String?  // 주식계좌 (옵셔널로 변경)
  account     Account? @relation(fields: [accountId], references: [id])
  assetId     String?  // 비주식 자산 (신규)
  asset       Asset?   @relation(fields: [assetId], references: [id])
  amount      Float    // 양수=입금, 음수=출금(이체 시)
  source      String   // "증여", "이체", "급여" 등
  note        String?
  depositedAt DateTime
  createdAt   DateTime @default(now())
}
```

accountId와 assetId 중 최소 하나는 있어야 함 (앱 레벨 검증).

### 이체 흐름 예시

"소담 입출금 → 주택청약 20만원":
1. Deposit(assetId=입출금, amount=-200000, source="이체")
2. Deposit(assetId=주택청약, amount=200000, source="이체")
3. Asset(입출금).value -= 200000
4. Asset(주택청약).value += 200000

### 증여 합산

owner별로:
- Account Deposit (source="증여") + Asset Deposit (source="증여")
- Asset.owner로 owner 매칭

### 변경 파일

1. `prisma/schema.prisma` — Deposit 모델 확장
2. 마이그레이션 SQL
3. `src/app/api/deposits/route.ts` — assetId 지원 + Asset.value 업데이트
4. `src/app/api/assets/[id]/deposits/route.ts` (신규) — 자산별 입금/이체 내역
5. `src/app/api/tax/gift/route.ts` — 비주식 Deposit 합산
6. `src/components/asset/AssetDepositList.tsx` (신규) — 입금/이체 내역 UI
7. `src/app/assets/AssetsClient.tsx` — 입금/이체 내역 섹션 추가

## 테스트 계획

- [ ] 자산 입금 (증여) → Deposit 생성 + Asset.value 증가
- [ ] 자산 간 이체 → 양쪽 Deposit + Asset.value 업데이트
- [ ] 증여세 현황 → 비주식 포함 합산
- [ ] lint + typecheck + build + 마이그레이션 통과

## 제외 사항

- 통합 증여 현황 뷰 (21-C에서)
- 텔레그램 봇 자산 입금/이체 커맨드 변경 없음
