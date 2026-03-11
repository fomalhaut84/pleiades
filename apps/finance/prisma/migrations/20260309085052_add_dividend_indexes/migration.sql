-- CreateIndex
CREATE INDEX "Dividend_accountId_payDate_idx" ON "Dividend"("accountId", "payDate");

-- CreateIndex
CREATE INDEX "Dividend_payDate_idx" ON "Dividend"("payDate");
