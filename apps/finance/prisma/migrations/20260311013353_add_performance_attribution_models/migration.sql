-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "benchmarkTicker" TEXT;

-- CreateTable
CREATE TABLE "PortfolioSnapshot" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "totalValueKRW" DOUBLE PRECISION NOT NULL,
    "totalCostKRW" DOUBLE PRECISION NOT NULL,
    "fxRate" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HoldingSnapshot" (
    "id" TEXT NOT NULL,
    "portfolioSnapshotId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "shares" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "valueKRW" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "HoldingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenchmarkPrice" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "priceDate" TIMESTAMP(3) NOT NULL,
    "close" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',

    CONSTRAINT "BenchmarkPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioSnapshot_accountId_snapshotDate_key" ON "PortfolioSnapshot"("accountId", "snapshotDate");

-- CreateIndex
CREATE INDEX "HoldingSnapshot_portfolioSnapshotId_idx" ON "HoldingSnapshot"("portfolioSnapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "BenchmarkPrice_ticker_priceDate_key" ON "BenchmarkPrice"("ticker", "priceDate");

-- AddForeignKey
ALTER TABLE "PortfolioSnapshot" ADD CONSTRAINT "PortfolioSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoldingSnapshot" ADD CONSTRAINT "HoldingSnapshot_portfolioSnapshotId_fkey" FOREIGN KEY ("portfolioSnapshotId") REFERENCES "PortfolioSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
