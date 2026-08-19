-- ST-3.1 / ST-3.2 / ST-3.3 — drop the schema behind three retired modules and
-- two dead accounting screens.
--
-- WHAT THIS IS FOR
-- ----------------
-- CCTV, vehicle sales and scrap metal stopped being sold in ST-1.1, and their
-- code left the tree in ST-2. Tables that no code can read are not free: they
-- are rows a `db push` still diffs, a backup still copies, a support engineer
-- still finds and believes. This removes them.
--
-- THE ORDER MATTERS, AND IT IS NOT ALPHABETICAL
-- --------------------------------------------
-- Every drop below is written from the DEPENDENT side inwards. Scrap is the one
-- that makes this a rule rather than a preference: `ScrapMetalPurchase` and
-- `ScrapMetalSale` hold foreign keys into `PurchaseBill`, `PurchasePayment`,
-- `Vendor`, `SalesInvoice`, `SalesReceipt` and `Customer` — six tables that
-- SURVIVE. A scrap ticket was never the accounting record; the bill and the
-- invoice were, they are what a VAT return is built from, and after this
-- migration they are the only remaining evidence that the transaction happened.
--
-- INVARIANT: not one accounting document is deleted here. Dropping the scrap
-- table removes the referencing row and its FK, and leaves the referenced row
-- untouched, which is exactly what `DROP TABLE` on the child does. Anything
-- that reversed the direction — a cascade from the parent, a delete of "orphan"
-- bills — would destroy a tenant's payables history to tidy up a module they
-- stopped paying for. The before/after proof is in the story notes: on a
-- fixture holding one scrap purchase and one scrap sale wired to a real bill,
-- payment, vendor, invoice, receipt and customer, all six survive at the same
-- row counts they had before.
--
-- StreamSession and PlaybackRecord are not named in the story. They are dropped
-- anyway because each holds a REQUIRED FK to Camera and cannot outlive it; the
-- ST-0.2 export lists them for the same reason. Leaving them would have failed
-- the Camera drop, and forcing that with CASCADE would have deleted rows nobody
-- had written down.
--
-- CostCenter and every `costCenterId` column STAY. BudgetLine referenced cost
-- centres, and it would have been easy to sweep them up with it, but the
-- posting engine allocates journal lines to cost centres — `JournalLine` and
-- `PostingRuleLine` both point at the table, and both are live.
--
-- ROLLBACK
-- --------
-- There is none in the forward sense: this drops tables, and a DROP has no
-- inverse. Restoring means (a) reverting the schema commit so the models come
-- back, (b) `prisma migrate deploy` against a database restored from a backup
-- taken before this ran, and (c) re-importing the per-tenant JSON that
-- `scripts/rollout/export-dropped-module-data.ts` wrote in ST-0.2. That export
-- is the reason this migration was allowed to exist, and it reads the dropped
-- tables through raw SQL precisely so it still runs against such a restore.
-- Reverting the migration alone gets you empty tables, which is worse than
-- none, because it looks like recovery.

-- ---------------------------------------------------------------------------
-- ST-3.1a — CCTV / surveillance.
--
-- Dependent-first: the two session tables and the access log point at Camera,
-- Camera points at NVR, and both point at Site, which stays.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS "PlaybackRecord";
DROP TABLE IF EXISTS "StreamSession";
DROP TABLE IF EXISTS "CameraAccessLog";
DROP TABLE IF EXISTS "CCTVEvent";
DROP TABLE IF EXISTS "Camera";
DROP TABLE IF EXISTS "NVR";

DROP TYPE IF EXISTS "CCTVEventType";
DROP TYPE IF EXISTS "EventSeverity";
DROP TYPE IF EXISTS "StreamProtocol";
DROP TYPE IF EXISTS "StreamSessionStatus";

-- ---------------------------------------------------------------------------
-- ST-3.1b — vehicle sales.
--
-- Deals and payments reference vehicles, leads and Users. Nothing here ever
-- posted to the ledger, so unlike scrap there is no surviving document to
-- protect — the ST-0.2 export records that too.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS "CarSalesPayment";
DROP TABLE IF EXISTS "CarSalesDeal";
DROP TABLE IF EXISTS "CarSalesVehicle";
DROP TABLE IF EXISTS "CarSalesLead";

DROP TYPE IF EXISTS "CarSalesPaymentStatus";
DROP TYPE IF EXISTS "CarSalesPaymentMethod";
DROP TYPE IF EXISTS "CarSalesDealStatus";
DROP TYPE IF EXISTS "CarSalesVehicleStatus";
DROP TYPE IF EXISTS "CarSalesLeadStatus";

-- ---------------------------------------------------------------------------
-- ST-3.1c — scrap metal. The careful one.
--
-- ScrapMetalBatchItem is dropped before both the batch and the purchase it
-- joins. ScrapMetalPurchase and ScrapMetalSale come next, and dropping them is
-- what releases the FKs into PurchaseBill / PurchasePayment / Vendor /
-- SalesInvoice / SalesReceipt / Customer. Those six tables are not named in any
-- statement below, which is the point.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS "ScrapMetalBatchItem";
DROP TABLE IF EXISTS "ScrapMetalSale";
DROP TABLE IF EXISTS "ScrapMetalPurchase";
DROP TABLE IF EXISTS "ScrapMetalBatch";
DROP TABLE IF EXISTS "ScrapMetalBalanceEntry";
DROP TABLE IF EXISTS "ScrapMetalEmployeeBalance";
DROP TABLE IF EXISTS "ScrapTicketComplianceRule";
DROP TABLE IF EXISTS "ScrapMetalPrice";
DROP TABLE IF EXISTS "ScrapSellerProfile";
DROP TABLE IF EXISTS "ScrapMaterial";

DROP TYPE IF EXISTS "ScrapMetalBalanceEntryType";
DROP TYPE IF EXISTS "ScrapMetalPurchaseStatus";
DROP TYPE IF EXISTS "ScrapMetalSaleStatus";
DROP TYPE IF EXISTS "ScrapMetalCategory";

-- ---------------------------------------------------------------------------
-- ST-3.2 — fixed assets and budgets.
--
-- Two accounting screens that were shipped, never seeded a posting rule, and
-- never posted a journal. BudgetLine goes before Budget (its parent) and before
-- neither ChartOfAccount nor CostCenter, both of which it referenced and both
-- of which stay.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS "BudgetLine";
DROP TABLE IF EXISTS "Budget";
DROP TABLE IF EXISTS "FixedAsset";

DROP TYPE IF EXISTS "BudgetStatus";
DROP TYPE IF EXISTS "DepreciationMethod";

-- ---------------------------------------------------------------------------
-- ST-3.3 — prune the AccountingSourceType values the drop leaves unreachable.
--
-- SCRAP_METAL_PURCHASE, SCRAP_METAL_BATCH and SCRAP_METAL_SALE were only ever
-- written by `captureAccountingEvent`, and scrap had no seeded posting rule in
-- `lib/accounting/defaults.ts`. Without a rule `createJournalEntryFromSource`
-- refuses with POSTING_RULE_MISSING, so the value could reach the nullable
-- `AccountingIntegrationEvent."sourceType"` and nowhere else. That is what
-- makes these three safe to drop and IRREGULAR_PAYOUT_DISBURSEMENT — captured
-- with status PENDING, and therefore able to reach a JournalEntry — not; the
-- schema says so beside the value.
--
-- HOW EXISTING ROWS ARE HANDLED, AND WHY THAT WAY.
--
--   AccountingIntegrationEvent — the column is NULLABLE, so the row is KEPT and
--   only its `sourceType` is cleared. Every other field survives:
--   `sourceDomain` still reads 'scrap-metal', `sourceAction` still reads
--   'sale', `description` still names the ticket, `payloadJson` still holds the
--   batch. The breadcrumb stays legible; what goes is a typed pointer at a kind
--   that no longer exists. Deleting the row would destroy the only record the
--   event happened, and rewriting it to MANUAL would assert something false.
--
--   BankTransaction — same column nullability, same treatment, though no scrap
--   code ever wrote one.
--
--   PostingRule — DELETED. A rule is configuration, not history: it says "when
--   an event of this kind arrives, post it like so", and no event of these
--   kinds can arrive again. An operator could have hand-created one through
--   `/api/accounting/posting-rules`, which accepts the whole enum.
--
--   JournalEntry and PaymentLedgerEntry — NOT NULL, and real financial history.
--   The migration ABORTS if either holds one of these values rather than
--   guessing. Both ways out of that situation falsify a ledger: rewriting the
--   row to MANUAL makes the trial balance describe a journal that was never
--   manual, and deleting it unbalances the books. If this raises on a real
--   database, the answer is a human deciding what those entries were — not a
--   migration deciding for them. `lib/workflow/approvals.test.ts` is the same
--   lesson learned on ApprovalTargetType, where the failure only appeared on a
--   database with history and CI was green the whole way.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  dead_types TEXT[] := ARRAY['SCRAP_METAL_PURCHASE', 'SCRAP_METAL_BATCH', 'SCRAP_METAL_SALE'];
  journal_rows BIGINT;
  ledger_rows BIGINT;
BEGIN
  SELECT count(*) INTO journal_rows
  FROM "JournalEntry" WHERE "sourceType"::text = ANY (dead_types);

  SELECT count(*) INTO ledger_rows
  FROM "PaymentLedgerEntry" WHERE "sourceType"::text = ANY (dead_types);

  IF journal_rows > 0 OR ledger_rows > 0 THEN
    RAISE EXCEPTION
      'ST-3.3: % JournalEntry and % PaymentLedgerEntry rows still name a scrap source type. These are posted financial history and this migration will not rewrite or delete them. Decide what they were, repoint them deliberately, then re-run.',
      journal_rows, ledger_rows;
  END IF;

  UPDATE "AccountingIntegrationEvent"
  SET "sourceType" = NULL
  WHERE "sourceType"::text = ANY (dead_types);

  UPDATE "BankTransaction"
  SET "sourceType" = NULL
  WHERE "sourceType"::text = ANY (dead_types);

  DELETE FROM "PostingRule"
  WHERE "sourceType"::text = ANY (dead_types);
END $$;

ALTER TYPE "AccountingSourceType" RENAME TO "AccountingSourceType_old";

CREATE TYPE "AccountingSourceType" AS ENUM (
  'MANUAL',
  'STOCK_RECEIPT',
  'STOCK_ISSUE',
  'STOCK_ADJUSTMENT',
  'STOCK_TRANSFER',
  'PAYROLL_RUN',
  'PAYROLL_DISBURSEMENT',
  'GOLD_PURCHASE',
  'GOLD_RECEIPT',
  'GOLD_DISPATCH',
  'SALES_INVOICE',
  'SALES_RECEIPT',
  'SALES_CREDIT_NOTE',
  'SALES_WRITE_OFF',
  'PURCHASE_BILL',
  'PURCHASE_PAYMENT',
  'PURCHASE_DEBIT_NOTE',
  'PURCHASE_WRITE_OFF',
  'BANK_TRANSACTION',
  'MAINTENANCE_COMPLETION',
  'IRREGULAR_PAYOUT_DISBURSEMENT',
  'RETAIL_SHIFT_OPEN',
  'RETAIL_GOODS_RECEIPT',
  'RETAIL_SALE',
  'RETAIL_REFUND',
  'RETAIL_VOID',
  'RETAIL_STOCK_ADJUSTMENT',
  'RETAIL_STOCK_TRANSFER',
  'RETAIL_SHIFT_VARIANCE',
  'GOLD_SHIFT_ALLOCATION_COMPANY',
  'GOLD_SHIFT_ALLOCATION_WORKER',
  'GOLD_SHIFT_EXPENSE',
  'GOLD_PAYOUT',
  'GOLD_INVENTORY_ADJUSTMENT',
  'SCHOOL_FEE_INVOICE',
  'SCHOOL_FEE_RECEIPT',
  'SCHOOL_FEE_RECEIPT_VOID',
  'SCHOOL_FEE_CREDIT_APPLIED',
  'SCHOOL_FEE_WAIVER',
  'SCHOOL_FEE_WRITE_OFF',
  'SCHOOL_FEE_REFUND'
);

-- The default has to come off before the cast and go back after: Postgres
-- checks the default against the column's new type, and 'MANUAL'::old is not
-- 'MANUAL'::new even though both spell the same word.
ALTER TABLE "JournalEntry" ALTER COLUMN "sourceType" DROP DEFAULT;
ALTER TABLE "JournalEntry"
  ALTER COLUMN "sourceType" TYPE "AccountingSourceType"
  USING ("sourceType"::text::"AccountingSourceType");
ALTER TABLE "AccountingIntegrationEvent"
  ALTER COLUMN "sourceType" TYPE "AccountingSourceType"
  USING ("sourceType"::text::"AccountingSourceType");
ALTER TABLE "PostingRule"
  ALTER COLUMN "sourceType" TYPE "AccountingSourceType"
  USING ("sourceType"::text::"AccountingSourceType");
ALTER TABLE "PaymentLedgerEntry"
  ALTER COLUMN "sourceType" TYPE "AccountingSourceType"
  USING ("sourceType"::text::"AccountingSourceType");
ALTER TABLE "BankTransaction"
  ALTER COLUMN "sourceType" TYPE "AccountingSourceType"
  USING ("sourceType"::text::"AccountingSourceType");
ALTER TABLE "JournalEntry" ALTER COLUMN "sourceType" SET DEFAULT 'MANUAL';

DROP TYPE "AccountingSourceType_old";

-- ---------------------------------------------------------------------------
-- WorkspaceProfile: SCRAP_METAL and AUTOS are DELIBERATELY NOT DROPPED.
--
-- `Company."workspaceProfile"` is NOT NULL. A tenant sitting on a retired
-- profile keeps holding the value, so dropping it would fail this migration
-- outright on any database with such a tenant — and the fix for that would be
-- to rewrite those companies to GENERAL from inside a schema migration, which
-- is a silent reconfiguration of somebody's workspace performed by a deploy.
--
-- Nothing crashes on the retained values: `RETIRED_WORKSPACE_PROFILES` in
-- `lib/workspace-products.ts` names both, and `toActiveWorkspaceProfile`
-- degrades them to GENERAL at every record lookup, so a stale profile reads as
-- the general defaults rather than indexing an empty row. Degrading is
-- defensible; crashing a tenant's workspace to tidy an enum is not.
-- ---------------------------------------------------------------------------
