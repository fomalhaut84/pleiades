-- CreateTable
CREATE TABLE "KrxStock" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "yahooTicker" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KrxStock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KrxStock_code_key" ON "KrxStock"("code");

-- CreateIndex
CREATE INDEX "KrxStock_name_idx" ON "KrxStock"("name");
