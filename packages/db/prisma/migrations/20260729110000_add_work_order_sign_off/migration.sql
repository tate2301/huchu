-- A job is finished when the person paying agrees it is.
ALTER TABLE "CrmWorkOrder" ADD COLUMN "signOffToken" TEXT;
ALTER TABLE "CrmWorkOrder" ADD COLUMN "signOffAskedAt" TIMESTAMP(3);
ALTER TABLE "CrmWorkOrder" ADD COLUMN "signOffAt" TIMESTAMP(3);
ALTER TABLE "CrmWorkOrder" ADD COLUMN "signOffName" TEXT;
ALTER TABLE "CrmWorkOrder" ADD COLUMN "signOffRating" INTEGER;
ALTER TABLE "CrmWorkOrder" ADD COLUMN "signOffNotes" TEXT;

CREATE UNIQUE INDEX "CrmWorkOrder_signOffToken_key" ON "CrmWorkOrder"("signOffToken");
