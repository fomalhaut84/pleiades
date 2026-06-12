-- Issue #289: transfer 카테고리 idempotent 데이터 마이그레이션
--
-- prisma/seed.ts에만 등록되어 있던 4개 transfer 카테고리를 운영 업그레이드 경로
-- (prisma migrate deploy)에도 보장. 기존 DB에는 영향 없음.
--
-- transaction API는 type = 'transfer'인 카테고리만 자산 이체 거래를 허용하므로
-- 누락 시 transfer 흐름이 차단된다.
--
-- 설계 결정:
--   1. id는 결정적 문자열(slug 기반) — gen_random_uuid()는 PG13+ 또는 pgcrypto 필요.
--   2. Category.slug AND name 모두 UNIQUE → ON CONFLICT 한 컬럼만 잡으면 다른 쪽
--      충돌 시 전체 INSERT 실패 → 마이그레이션이 failed로 기록되어 이후 deploy 차단.
--      → INSERT ... SELECT ... WHERE NOT EXISTS 패턴으로 양쪽 동시 가드.
--   3. 신규 설치 경로(migrate deploy + db seed)에서는 시드의 deleteMany가 이 row를
--      덮어쓰므로 결정적 id는 시드 미실행 환경(운영 업그레이드)에서만 의미를 가짐.

INSERT INTO "Category" (id, slug, name, type, icon, keywords, "sortOrder", "groupId", "createdAt")
SELECT 'cat_transfer_savings', 'savings', '적금', 'transfer', '🏦', ARRAY['적금','저축']::text[], 1, NULL, NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Category" WHERE slug = 'savings' OR name = '적금');

INSERT INTO "Category" (id, slug, name, type, icon, keywords, "sortOrder", "groupId", "createdAt")
SELECT 'cat_transfer_deposit', 'deposit', '예금', 'transfer', '💳', ARRAY['예금','정기예금']::text[], 2, NULL, NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Category" WHERE slug = 'deposit' OR name = '예금');

INSERT INTO "Category" (id, slug, name, type, icon, keywords, "sortOrder", "groupId", "createdAt")
SELECT 'cat_transfer_investment', 'investment', '투자계좌', 'transfer', '📈', ARRAY['투자','증권','주식계좌']::text[], 3, NULL, NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Category" WHERE slug = 'investment' OR name = '투자계좌');

INSERT INTO "Category" (id, slug, name, type, icon, keywords, "sortOrder", "groupId", "createdAt")
SELECT 'cat_transfer_etc', 'etc-transfer', '기타이체', 'transfer', '🔄', ARRAY['이체','송금']::text[], 99, NULL, NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Category" WHERE slug = 'etc-transfer' OR name = '기타이체');
