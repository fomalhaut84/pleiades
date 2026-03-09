-- Add vestPrice, vestedAt columns
ALTER TABLE "RSUSchedule" ADD COLUMN "vestPrice" DOUBLE PRECISION,
ADD COLUMN "vestedAt" TIMESTAMP(3);

-- Make shares NOT NULL (existing rows already have values)
ALTER TABLE "RSUSchedule" ALTER COLUMN "shares" SET NOT NULL;

-- Add accountId as nullable first
ALTER TABLE "RSUSchedule" ADD COLUMN "accountId" TEXT;

-- Backfill: link existing RSU rows to 세진's account
UPDATE "RSUSchedule" SET "accountId" = (SELECT "id" FROM "Account" WHERE "name" = '세진' LIMIT 1);

-- Now make accountId required
ALTER TABLE "RSUSchedule" ALTER COLUMN "accountId" SET NOT NULL;

-- Add foreign key
ALTER TABLE "RSUSchedule" ADD CONSTRAINT "RSUSchedule_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
