# 289: transfer 카테고리 idempotent 데이터 마이그레이션

## 목적

`prisma/seed.ts:309-312`의 4개 transfer 카테고리(`savings`, `deposit`, `investment`, `etc-transfer`)를 idempotent SQL 마이그레이션으로 분리해, 기존 DB에 `prisma migrate deploy`만 실행해도 자동 등록되도록 한다.

## 배경

- v0.5.0 릴리즈 PR #288의 Codex 리뷰에서 식별된 P1
- 시드 스크립트는 신규 설치에만 실행됨. 운영 업그레이드 경로(`prisma migrate deploy`)에는 미적용
- transaction API는 `type === 'transfer'`인 카테고리만 transfer 거래 허용 → 누락 시 자산 이체 흐름 차단

## 요구사항

- [ ] `prisma/migrations/<timestamp>_add_transfer_categories/migration.sql` 신규 생성
- [ ] 4개 카테고리 INSERT (ON CONFLICT DO NOTHING으로 idempotent 보장)
- [ ] 기존 운영 DB에 이미 있으면 충돌 없이 통과
- [ ] 신규 DB에는 정상 생성

## 기술 설계

### Schema 제약
- `slug` UNIQUE **+ `name` UNIQUE** → 둘 중 어느 쪽 충돌이든 INSERT 전체 롤백 가능
- `id`는 Prisma 측 `cuid()` 기본값, raw SQL에서는 직접 지정 필요
- `keywords`는 PostgreSQL `text[]` 배열
- `createdAt`은 default(now()) 적용

### 설계 결정

1. **결정적 id (`cat_transfer_*`)**: `gen_random_uuid()`는 PostgreSQL 13+ 또는 pgcrypto 확장이 필요해 의존성 우려. 결정적 문자열 id로 의존성 제거. 신규 설치 경로에서는 seed의 `deleteMany`가 이를 덮어써서 cuid id로 재생성되므로, 결정적 id는 시드 미실행 환경(운영 업그레이드 경로)에서만 의미를 가짐.

2. **`INSERT ... SELECT ... WHERE NOT EXISTS` 패턴**: `ON CONFLICT (slug)`만 사용하면 `name` UNIQUE 충돌 시 마이그레이션 실패 → `_prisma_migrations`에 failed 기록 → 이후 `prisma migrate deploy` 차단. slug AND name 양쪽을 가드하는 패턴으로 처리.

### Migration SQL

```sql
INSERT INTO "Category" (id, slug, name, type, icon, keywords, "sortOrder", "groupId", "createdAt")
SELECT 'cat_transfer_savings', 'savings', '적금', 'transfer', '🏦', ARRAY['적금','저축']::text[], 1, NULL, NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Category" WHERE slug = 'savings' OR name = '적금');
-- (deposit / investment / etc-transfer 동일 패턴)
```

### Seed와의 일관성

`prisma/seed.ts:309-312`는 그대로 유지. 신규 설치 시:
1. 마이그레이션이 4개를 `cat_transfer_*` id로 생성
2. seed의 `deleteMany` (line 107)가 모두 삭제
3. seed의 `createMany`가 16개 카테고리를 cuid id로 재생성

운영 업그레이드 시:
1. 마이그레이션이 4개 중 누락분만 생성 (slug/name 양쪽 가드)
2. seed 미실행 → 결정적 id 유지

## 테스트 계획

- [ ] `npm run lint`
- [ ] `npx tsc --noEmit`
- [ ] 마이그레이션 SQL 구문 검증
- [ ] 운영 DB에 적용 후 4개 카테고리 존재 확인 (이미 있다면 ON CONFLICT 통과)

## 배포

`prisma migrate deploy` 시 자동 적용. 별도 수동 작업 불필요.

## 라벨

- `fix`, `P1`
