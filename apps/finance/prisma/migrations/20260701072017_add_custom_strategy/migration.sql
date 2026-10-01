-- CreateTable
CREATE TABLE "CustomStrategy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ticker" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "logic" TEXT NOT NULL DEFAULT 'AND',
    "frequency" TEXT NOT NULL DEFAULT 'daily',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomStrategy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomStrategy_ticker_isActive_idx" ON "CustomStrategy"("ticker", "isActive");
