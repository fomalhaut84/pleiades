-- CreateTable
CREATE TABLE "IncomeProfile" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "inputType" TEXT NOT NULL,
    "grossSalary" DOUBLE PRECISION,
    "earnedDeduction" DOUBLE PRECISION,
    "taxableIncome" DOUBLE PRECISION NOT NULL,
    "prepaidTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomeProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IncomeProfile_year_key" ON "IncomeProfile"("year");
