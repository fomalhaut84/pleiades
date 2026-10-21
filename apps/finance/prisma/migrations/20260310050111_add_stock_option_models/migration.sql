-- CreateTable
CREATE TABLE "StockOption" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "grantDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "strikePrice" DOUBLE PRECISION NOT NULL,
    "totalShares" INTEGER NOT NULL,
    "cancelledShares" INTEGER NOT NULL DEFAULT 0,
    "exercisedShares" INTEGER NOT NULL DEFAULT 0,
    "adjustedShares" INTEGER NOT NULL DEFAULT 0,
    "remainingShares" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockOptionVesting" (
    "id" TEXT NOT NULL,
    "stockOptionId" TEXT NOT NULL,
    "vestingDate" TIMESTAMP(3) NOT NULL,
    "shares" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "exercisedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "StockOptionVesting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockOption_accountId_idx" ON "StockOption"("accountId");

-- CreateIndex
CREATE INDEX "StockOptionVesting_stockOptionId_idx" ON "StockOptionVesting"("stockOptionId");

-- CreateIndex
CREATE INDEX "StockOptionVesting_vestingDate_idx" ON "StockOptionVesting"("vestingDate");

-- AddForeignKey
ALTER TABLE "StockOption" ADD CONSTRAINT "StockOption_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockOptionVesting" ADD CONSTRAINT "StockOptionVesting_stockOptionId_fkey" FOREIGN KEY ("stockOptionId") REFERENCES "StockOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
