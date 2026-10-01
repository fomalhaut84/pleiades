-- CreateTable
CREATE TABLE "EarningsCache" (
    "ticker" TEXT NOT NULL,
    "nextEarningsDate" TIMESTAMP(3),
    "lastFetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EarningsCache_pkey" PRIMARY KEY ("ticker")
);
