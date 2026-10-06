-- SET-08: a sale rung while a fiscal day's report is on its way to ZIMRA waits,
-- marked, for the next day it can be signed into; and one close holds a day at a time.
ALTER TABLE "RetailSale" ADD COLUMN "fiscalWaitsSince" TIMESTAMP(3);

CREATE INDEX "RetailSale_companyId_fiscalWaitsSince_idx" ON "RetailSale"("companyId", "fiscalWaitsSince");

ALTER TABLE "FiscalDay" ADD COLUMN "closingSince" TIMESTAMP(3);
