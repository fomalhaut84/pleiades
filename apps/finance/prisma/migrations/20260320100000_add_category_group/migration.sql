-- CreateTable
CREATE TABLE "CategoryGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoryGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategoryGroup_name_key" ON "CategoryGroup"("name");

-- AlterTable: Category에 groupId 추가
ALTER TABLE "Category" ADD COLUMN "groupId" TEXT;

-- CreateIndex
CREATE INDEX "Category_groupId_idx" ON "Category"("groupId");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CategoryGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Budget에 groupId 추가
ALTER TABLE "Budget" ADD COLUMN "groupId" TEXT;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CategoryGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "Budget_groupId_year_month_key" ON "Budget"("groupId", "year", "month");

-- =============================================
-- 데이터 마이그레이션: 10개 그룹 생성 + 카테고리 배정
-- =============================================

-- 그룹 생성
INSERT INTO "CategoryGroup" ("id", "name", "icon", "sortOrder") VALUES
  ('grp_living', '생활비', '🛒', 1),
  ('grp_utility', '공과금', '💡', 2),
  ('grp_transport', '교통', '🚗', 3),
  ('grp_education', '교육', '🎓', 4),
  ('grp_housing', '주거', '🏠', 5),
  ('grp_health', '의료/건강', '🏥', 6),
  ('grp_finance', '금융', '🏦', 7),
  ('grp_app', '앱결제', '📱', 8),
  ('grp_leisure', '여가', '🎭', 9),
  ('grp_etc', '기타', '📦', 10);

-- 카테고리에 그룹 배정 (slug 기준)
UPDATE "Category" SET "groupId" = 'grp_living' WHERE "slug" IN ('식료품', '외식', '생활용품', '커피카드충전', '커피음료', '간식', '의류', '미용', '장난감');
UPDATE "Category" SET "groupId" = 'grp_utility' WHERE "slug" IN ('전기요금', '가스요금', '통신비', '세금');
UPDATE "Category" SET "groupId" = 'grp_transport' WHERE "slug" IN ('차량정비', '주유', '주차', '대중교통', '세차');
UPDATE "Category" SET "groupId" = 'grp_education' WHERE "slug" IN ('도서', '온라인강의', '학비', '학원');
UPDATE "Category" SET "groupId" = 'grp_housing' WHERE "slug" IN ('관리비', '쓰레기처리비용');
UPDATE "Category" SET "groupId" = 'grp_health' WHERE "slug" IN ('약국', '병원', '건강보조');
UPDATE "Category" SET "groupId" = 'grp_finance' WHERE "slug" IN ('보험', '이자', '연회비');
UPDATE "Category" SET "groupId" = 'grp_app' WHERE "slug" IN ('앱결제구독료', '앱결제비정기');
UPDATE "Category" SET "groupId" = 'grp_leisure' WHERE "slug" IN ('여행숙박', '여행교통', '여행식사', '여행기타', '전시및관람');
UPDATE "Category" SET "groupId" = 'grp_etc' WHERE "slug" IN ('기부정기후원', '세진물품', '선물', '경조사');
