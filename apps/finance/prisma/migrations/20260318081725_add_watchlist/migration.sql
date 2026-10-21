-- CreateTable
CREATE TABLE "Watchlist" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "strategy" TEXT NOT NULL DEFAULT 'swing',
    "memo" TEXT,
    "targetBuy" DOUBLE PRECISION,
    "entryLow" DOUBLE PRECISION,
    "entryHigh" DOUBLE PRECISION,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Watchlist_ticker_key" ON "Watchlist"("ticker");
