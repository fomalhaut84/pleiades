-- CreateTable
CREATE TABLE "QuarterlyReport" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "aiComment" TEXT,
    "pdfPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuarterlyReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuarterlyReport_year_quarter_key" ON "QuarterlyReport"("year", "quarter");
