-- AlterTable: Transaction에 type, linkedAssetId 추가
ALTER TABLE "Transaction" ADD COLUMN "type" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "linkedAssetId" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_linkedAssetId_idx" ON "Transaction"("linkedAssetId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_linkedAssetId_fkey" FOREIGN KEY ("linkedAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
