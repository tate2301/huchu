-- A deposit invoice knows it is one, and a document can name its layout.
ALTER TABLE "CrmLeadDocument" ADD COLUMN "isDeposit" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CrmLeadDocument" ADD COLUMN "renderTemplateId" TEXT;
