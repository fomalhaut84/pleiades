# 구현 계획: 비주식 자산 증여 추적 (#249)

## 변경 파일 (7개)

| 순서 | 파일 | 변경 내용 |
|------|------|-----------|
| 1 | `prisma/schema.prisma` | Deposit 모델 확장 |
| 2 | 마이그레이션 | accountId 옵셔널화 + assetId 추가 |
| 3 | `src/app/api/deposits/route.ts` | assetId 지원 + Asset.value 트랜잭션 |
| 4 | `src/app/api/assets/[id]/deposits/route.ts` (신규) | 자산별 입금/이체 조회 + 이체 생성 |
| 5 | `src/app/api/tax/gift/route.ts` | 비주식 Deposit 합산 |
| 6 | `src/components/asset/AssetDepositList.tsx` (신규) | 입금/이체 내역 UI |
| 7 | `src/app/assets/AssetsClient.tsx` | 입금/이체 섹션 통합 |

## 구현 순서

1. DB 스키마 변경 + 마이그레이션
2. API 수정/추가
3. 증여세 합산 수정
4. 웹 UI

## 패키지 추가: 없음
