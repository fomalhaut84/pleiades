-- CreateTable
CREATE TABLE "AlertHistory" (
    "id" TEXT NOT NULL,
    "firedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "ticker" TEXT,
    "price" DOUBLE PRECISION,
    "changePercent" DOUBLE PRECISION,
    "message" TEXT NOT NULL,
    "deliveryStatus" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,

    CONSTRAINT "AlertHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AlertHistory_firedAt_idx" ON "AlertHistory"("firedAt");

-- CreateIndex
CREATE INDEX "AlertHistory_kind_firedAt_idx" ON "AlertHistory"("kind", "firedAt");

-- CreateIndex
CREATE INDEX "AlertHistory_ticker_firedAt_idx" ON "AlertHistory"("ticker", "firedAt");
