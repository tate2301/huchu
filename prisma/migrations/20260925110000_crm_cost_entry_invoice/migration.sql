-- Money received, tied to the invoice it is paying.
--
-- A rep collecting cash on site logged it as "received" with nothing to say
-- whose bill it was against. Accounting records the payment separately, as a
-- receipt against the invoice, and between the two there was no way to see
-- cash that had been taken and never receipted -- the gap a float
-- disappears into.
--
-- The entry now names the invoice's CRM document. The cost tracker compares
-- what has been logged against each invoice with what accounting has actually
-- receipted on it, and flags the difference. That comparison only reads
-- accounting; nothing here writes to it.
--
-- SET NULL: an invoice document removed from a deal leaves the cash entry
-- standing. The money was still received.
ALTER TABLE "CrmDailyCostEntry" ADD COLUMN "invoiceDocumentId" TEXT;

CREATE INDEX "CrmDailyCostEntry_companyId_invoiceDocumentId_idx"
  ON "CrmDailyCostEntry"("companyId", "invoiceDocumentId");

ALTER TABLE "CrmDailyCostEntry"
  ADD CONSTRAINT "CrmDailyCostEntry_invoiceDocumentId_fkey" FOREIGN KEY ("invoiceDocumentId")
  REFERENCES "CrmLeadDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
