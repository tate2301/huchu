-- P4 (books-final §7 and §8, approved 19 Oct): undo everywhere.
--   D7   supersedesId on SalesInvoice, SalesQuotation, PurchaseBill and CreditNote (a self-relation):
--        Revise voids a posted document and makes a new draft linked back to it, which takes its
--        number at issue (§4.1 rules 2 and 8). Both stay visible. Past revisions stay as they are.
--   D18  FiscalisationProviderConfig.isTestDevice: a device registered against ZIMRA's test environment,
--        whose signed documents the owner may purge (§2.5, §5.12). Off for every device.
-- No backfill, no new table: the snapshot of what is voided, revised, deleted or purged is kept in the
-- audit event (PlatformAuditEvent), as the brief's default 3 says.

-- AlterTable
ALTER TABLE "SalesInvoice" ADD COLUMN "supersedesId" TEXT;
ALTER TABLE "SalesQuotation" ADD COLUMN "supersedesId" TEXT;
ALTER TABLE "PurchaseBill" ADD COLUMN "supersedesId" TEXT;
ALTER TABLE "CreditNote" ADD COLUMN "supersedesId" TEXT;
ALTER TABLE "FiscalisationProviderConfig" ADD COLUMN "isTestDevice" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "SalesInvoice_companyId_supersedesId_idx" ON "SalesInvoice"("companyId", "supersedesId");
CREATE INDEX "SalesQuotation_companyId_supersedesId_idx" ON "SalesQuotation"("companyId", "supersedesId");
CREATE INDEX "PurchaseBill_companyId_supersedesId_idx" ON "PurchaseBill"("companyId", "supersedesId");
CREATE INDEX "CreditNote_companyId_supersedesId_idx" ON "CreditNote"("companyId", "supersedesId");

-- AddForeignKey
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "SalesInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesQuotation" ADD CONSTRAINT "SalesQuotation_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "SalesQuotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseBill" ADD CONSTRAINT "PurchaseBill_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "PurchaseBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "CreditNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Vane's and Explore's readers read the new columns, as `pnpm vane:reader-sql` and `pnpm explore:reader-sql` print them.
GRANT SELECT ("id", "companyId", "customerId", "invoiceNumber", "invoiceDate", "dueDate", "status", "currency", "exchangeRate", "rateSource", "baseTotal", "subTotal", "taxTotal", "total", "amountPaid", "creditTotal", "writeOffTotal", "notes", "fiscalStatus", "quotationId", "revision", "createdById", "madeByVane", "issuedById", "issuedAt", "supersedesId", "createdAt", "updatedAt") ON "SalesInvoice" TO vane_reader;
GRANT SELECT ("id", "companyId", "customerId", "quotationNumber", "quotationDate", "validUntil", "status", "currency", "exchangeRate", "rateSource", "baseTotal", "subTotal", "taxTotal", "total", "notes", "createdById", "madeByVane", "issuedById", "issuedAt", "supersedesId", "createdAt", "updatedAt") ON "SalesQuotation" TO vane_reader;
GRANT SELECT ("id", "companyId", "invoiceId", "noteNumber", "noteDate", "status", "currency", "exchangeRate", "rateSource", "baseTotal", "subTotal", "taxTotal", "total", "reason", "createdById", "issuedById", "issuedAt", "supersedesId", "createdAt", "updatedAt") ON "CreditNote" TO vane_reader;
GRANT SELECT ("id", "companyId", "vendorId", "billNumber", "billDate", "dueDate", "status", "currency", "exchangeRate", "rateSource", "baseTotal", "subTotal", "taxTotal", "total", "amountPaid", "debitNoteTotal", "writeOffTotal", "notes", "createdById", "issuedById", "issuedAt", "supersedesId", "goodsReceiptId", "purchaseOrderId", "needsReview", "supplierFtiNumber", "fdmsStatus", "fdmsCheckedAt", "fdmsCheckedById", "approvedById", "approvedAt", "createdAt", "updatedAt") ON "PurchaseBill" TO vane_reader;
GRANT SELECT ("id", "companyId", "providerKey", "apiBaseUrl", "username", "authType", "deviceId", "timeoutMs", "retryPolicyJson", "certificateRef", "metadataJson", "isActive", "serialNumber", "registeredAt", "registeredById", "lastOkAt", "lastFailedAt", "isTestDevice", "createdAt", "updatedAt") ON "FiscalisationProviderConfig" TO vane_reader;
GRANT SELECT ("id", "companyId", "customerId", "invoiceNumber", "invoiceDate", "dueDate", "status", "currency", "exchangeRate", "rateSource", "baseTotal", "subTotal", "taxTotal", "total", "amountPaid", "creditTotal", "writeOffTotal", "notes", "fiscalStatus", "quotationId", "revision", "createdById", "madeByVane", "issuedById", "issuedAt", "supersedesId", "createdAt", "updatedAt") ON "SalesInvoice" TO explore_reader;
GRANT SELECT ("id", "companyId", "customerId", "quotationNumber", "quotationDate", "validUntil", "status", "currency", "exchangeRate", "rateSource", "baseTotal", "subTotal", "taxTotal", "total", "notes", "createdById", "madeByVane", "issuedById", "issuedAt", "supersedesId", "createdAt", "updatedAt") ON "SalesQuotation" TO explore_reader;
GRANT SELECT ("id", "companyId", "invoiceId", "noteNumber", "noteDate", "status", "currency", "exchangeRate", "rateSource", "baseTotal", "subTotal", "taxTotal", "total", "reason", "createdById", "issuedById", "issuedAt", "supersedesId", "createdAt", "updatedAt") ON "CreditNote" TO explore_reader;
GRANT SELECT ("id", "companyId", "vendorId", "billNumber", "billDate", "dueDate", "status", "currency", "exchangeRate", "rateSource", "baseTotal", "subTotal", "taxTotal", "total", "amountPaid", "debitNoteTotal", "writeOffTotal", "notes", "createdById", "issuedById", "issuedAt", "supersedesId", "goodsReceiptId", "purchaseOrderId", "needsReview", "supplierFtiNumber", "fdmsStatus", "fdmsCheckedAt", "fdmsCheckedById", "approvedById", "approvedAt", "createdAt", "updatedAt") ON "PurchaseBill" TO explore_reader;
GRANT SELECT ("id", "companyId", "providerKey", "apiBaseUrl", "username", "authType", "deviceId", "timeoutMs", "retryPolicyJson", "certificateRef", "metadataJson", "isActive", "serialNumber", "registeredAt", "registeredById", "lastOkAt", "lastFailedAt", "isTestDevice", "createdAt", "updatedAt") ON "FiscalisationProviderConfig" TO explore_reader;
