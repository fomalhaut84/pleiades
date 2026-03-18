-- CreateTable
CREATE TABLE "HoldingStrategy" (
    "id" TEXT NOT NULL,
    "holdingId" TEXT NOT NULL,
    "strategy" TEXT NOT NULL DEFAULT 'long_hold',
    "memo" TEXT,
    "targetPrice" DOUBLE PRECISION,
    "stopLoss" DOUBLE PRECISION,
    "entryLow" DOUBLE PRECISION,
    "entryHigh" DOUBLE PRECISION,
    "reviewDate" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HoldingStrategy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HoldingStrategy_holdingId_key" ON "HoldingStrategy"("holdingId");

-- AddForeignKey
ALTER TABLE "HoldingStrategy" ADD CONSTRAINT "HoldingStrategy_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "Holding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
