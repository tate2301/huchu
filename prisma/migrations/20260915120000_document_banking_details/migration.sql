-- The trading entity and banking details on quotations and invoices.
--
-- The document pipeline already rendered a company identity block and a
-- payment block from `CompanyBranding`; what it could not render was a branch,
-- a clearing code, the bank's address, or a second account. A Zimbabwean quote
-- is settled in USD or in ZWG, so the paper has to carry both sets of details
-- or the customer pays into the wrong one.
--
-- The split follows how the details are actually shaped: the bank-level facts
-- are the same for every account held there and stay on `CompanyBranding`,
-- while the per-account facts belong to `BankAccount`, which already exists per
-- company and already carries a currency.
--
-- No numbers are added here. Values are per tenant and live in the database,
-- not in the repository or in a deployment-wide environment variable, which
-- could not hold two tenants' accounts at once.

ALTER TABLE "CompanyBranding"
  ADD COLUMN "bankBranch"     TEXT,
  ADD COLUMN "bankBranchCode" TEXT,
  ADD COLUMN "bankAddress"    TEXT;

-- `showOnDocuments` is deliberately not `isActive`: a tenant reconciles
-- accounts it would never ask a customer to pay into, and retiring an account
-- from the ledger should not silently change what the next quotation says.
-- Off by default, so no existing tenant's paper changes until somebody opts an
-- account in.
ALTER TABLE "BankAccount"
  ADD COLUMN "accountName"      TEXT,
  ADD COLUMN "showOnDocuments"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "documentPosition" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "BankAccount_companyId_showOnDocuments_documentPosition_idx"
  ON "BankAccount"("companyId", "showOnDocuments", "documentPosition");
