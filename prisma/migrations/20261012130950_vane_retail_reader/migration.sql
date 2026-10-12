-- Vane's reader roles reach the retail tables and columns added after 20261012120000_vane
-- (customers, loyalty, messages, lay-bys, merges, requisitions, money accounts, deliveries,
-- empties and the purchase-order rework). Generated with `pnpm vane:reader-sql` and kept to
-- what 20261012120000_vane does not already grant: a row policy and column grants for each
-- new table, and grants for the new columns of tables it already covers. See docs/vane.md.
-- RetailEmptiesEntry is dropped and recreated by 20261012130100_retail_empties, so its row policies and
-- grants from 20261012120000_vane went with it: it gets them again here, whole.
ALTER TABLE "RetailEmptiesEntry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailEmptiesEntry" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailEmptiesEntry" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "siteId", "kind", "bottles", "crates", "deposit", "bottlesAfter", "cratesAfter", "saleId", "customerId", "supplierId", "supplierName", "goodsReceiptId", "returnId", "reference", "note", "createdById", "createdAt") ON "RetailEmptiesEntry" TO vane_reader;
GRANT SELECT ("bottleDeposit", "crateDeposit") ON "RetailShopProfile" TO vane_reader;
GRANT SELECT ("vendorId", "firstExpectedDate", "payment", "noteToSupplier", "sentAt", "sentById", "sentVia", "chaseAction", "chasedAt", "chasedById", "followUpDoneAt", "cancelledAt", "cancelledById", "duplicatedFromId", "archivedAt") ON "RetailPurchaseOrder" TO vane_reader;
GRANT SELECT ("vatRate", "sentQuantity", "closedShortAt", "closedShortById", "sortOrder") ON "RetailPurchaseOrderLine" TO vane_reader;
GRANT SELECT ("vendorId", "noteNumber", "driver", "countedById", "checkedById", "checkedAt", "paying", "requisitionId", "reversedAt", "reversedById", "reverseReason") ON "RetailGoodsReceipt" TO vane_reader;
GRANT SELECT ("noteQuantity", "damagedQuantity", "vatRate") ON "RetailGoodsReceiptLine" TO vane_reader;
ALTER TABLE "RetailDeliveryDifference" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailDeliveryDifference" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailDeliveryDifference" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "receiptId", "receiptLineId", "kind", "quantity", "value", "settle", "atReceiving", "settledAt", "returnId", "createdById", "createdAt") ON "RetailDeliveryDifference" TO vane_reader;
GRANT SELECT ("laybyMinDepositPercent", "laybyCancelFee", "laybyMaxDays") ON "RetailTillRules" TO vane_reader;
ALTER TABLE "RetailLayby" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailLayby" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailLayby" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "laybyNo", "siteId", "customerId", "status", "total", "paid", "dueOn", "remindWeekly", "lastRemindedAt", "createdById", "collectedAt", "collectedById", "saleId", "cancelledAt", "cancelledById", "cancelFee", "createdAt", "updatedAt") ON "RetailLayby" TO vane_reader;
ALTER TABLE "RetailLaybyLine" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailLaybyLine" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailLaybyLine" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "laybyId", "productId", "inventoryItemId", "itemName", "quantity", "unitPrice", "lineTotal", "taxAmount", "costUnit", "priceListId", "createdAt") ON "RetailLaybyLine" TO vane_reader;
ALTER TABLE "RetailLaybyPayment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailLaybyPayment" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailLaybyPayment" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "laybyId", "kind", "tenderType", "amount", "currency", "exchangeRate", "baseAmount", "reference", "shiftId", "cashMovementId", "receivedById", "createdAt") ON "RetailLaybyPayment" TO vane_reader;
GRANT SELECT ("customerId", "batchId") ON "RetailMessage" TO vane_reader;
ALTER TABLE "RetailMessageBatch" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailMessageBatch" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailMessageBatch" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "purpose", "audience", "template", "scheduledFor", "total", "createdById", "createdAt") ON "RetailMessageBatch" TO vane_reader;
GRANT SELECT ("eventAccountKey") ON "PostingRuleLine" TO vane_reader;
GRANT SELECT ("code", "whatsapp", "area", "dateOfBirth", "marketingConsent", "consentChangedAt", "cardNo", "tierHeld", "tierHeldUntil", "priceListId", "archivedAt", "mergedIntoId", "createdById") ON "Customer" TO vane_reader;
ALTER TABLE "RetailCustomerMerge" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailCustomerMerge" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailCustomerMerge" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "survivorId", "duplicateId", "survivorPhoneBefore", "filledFields", "saleIds", "laybyIds", "voucherIds", "noteIds", "accountMoved", "points", "visits", "mergedById", "createdAt", "undoneAt", "undoneById") ON "RetailCustomerMerge" TO vane_reader;
ALTER TABLE "RetailCustomerNote" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailCustomerNote" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailCustomerNote" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "customerId", "body", "createdById", "createdAt") ON "RetailCustomerNote" TO vane_reader;
ALTER TABLE "RetailLoyaltySettings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailLoyaltySettings" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailLoyaltySettings" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("companyId", "enabled", "earnPerDollar", "pointValue", "spendFrom", "expiry", "tiers", "topTierEarnPerDollar", "earnOnPromotions", "birthdayBonus", "birthdayPoints", "pointsPayForAlcohol", "updatedById", "createdAt", "updatedAt") ON "RetailLoyaltySettings" TO vane_reader;
ALTER TABLE "RetailPointsEntry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailPointsEntry" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailPointsEntry" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "seq", "companyId", "customerId", "kind", "points", "value", "saleId", "reason", "note", "actorId", "actorName", "mergedFromId", "createdAt") ON "RetailPointsEntry" TO vane_reader;
GRANT SELECT ("vendorId", "groupNo", "requisitionId") ON "PurchasePayment" TO vane_reader;
GRANT SELECT ("kind", "ledgerAccountId") ON "BankAccount" TO vane_reader;
ALTER TABLE "RetailExpenseType" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailExpenseType" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailExpenseType" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "name", "category", "ledgerAccountId", "archivedAt", "createdAt") ON "RetailExpenseType" TO vane_reader;
ALTER TABLE "RetailAttachment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "RetailAttachment" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "RetailAttachment" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "entityType", "entityId", "kind", "url", "name", "contentType", "size", "addedById", "createdAt") ON "RetailAttachment" TO vane_reader;
GRANT SELECT ("purchaseOrderId", "expenseTypeId", "payeeVendorId", "approverId", "approvalLimit", "rejectReason", "paidAmount", "paidToId", "payoutMethod", "payoutReference", "receiptsDueAt", "acquittedById", "changeAmount", "changeAccountId", "acquittalNote", "cancelledAt", "cancelledById") ON "CrmRequisition" TO vane_reader;
