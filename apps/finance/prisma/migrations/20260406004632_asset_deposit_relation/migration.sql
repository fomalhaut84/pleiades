-- DropForeignKey
ALTER TABLE "Deposit" DROP CONSTRAINT "Deposit_accountId_fkey";

-- AlterTable
ALTER TABLE "Deposit" ADD COLUMN     "assetId" TEXT,
ALTER COLUMN "accountId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Deposit_assetId_depositedAt_idx" ON "Deposit"("assetId", "depositedAt");

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
