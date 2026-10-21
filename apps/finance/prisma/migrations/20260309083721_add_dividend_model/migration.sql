-- CreateTable
CREATE TABLE "Dividend" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "exDate" TIMESTAMP(3),
    "payDate" TIMESTAMP(3) NOT NULL,
    "amountGross" DOUBLE PRECISION NOT NULL,
    "amountNet" DOUBLE PRECISION NOT NULL,
    "taxAmount" DOUBLE PRECISION,
    "currency" TEXT NOT NULL,
    "fxRate" DOUBLE PRECISION,
    "amountKRW" DOUBLE PRECISION NOT NULL,
    "reinvested" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dividend_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Dividend" ADD CONSTRAINT "Dividend_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
