-- DropIndex
DROP INDEX "StockOption_accountId_idx";

-- DropIndex
DROP INDEX "StockOptionVesting_stockOptionId_idx";

-- DropIndex
DROP INDEX "StockOptionVesting_vestingDate_idx";

-- CreateIndex
CREATE INDEX "StockOption_accountId_grantDate_idx" ON "StockOption"("accountId", "grantDate");

-- CreateIndex
CREATE INDEX "StockOptionVesting_stockOptionId_vestingDate_idx" ON "StockOptionVesting"("stockOptionId", "vestingDate");
