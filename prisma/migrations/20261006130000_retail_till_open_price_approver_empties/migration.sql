-- The till's next features on PR #193's server.
--
-- A product may be sold at whatever the cashier types (airtime, bundles): an
-- open price is not a price change for a manager.
--
-- A sale, refund or void a manager approved with their PIN names them: the
-- person, and their name as it was. Sales before this keep their approver in
-- the audit chain only.
--
-- A shop names each deposit value it charges ("Bottles, 340 to 375ml" for
-- 0.10); products keep their own amount and the name is found by it.
--
-- Empties brought back at the till go on a ledger per supplier, written with
-- the sale: positive is brought back to the shop, a void writes them negative.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "openPrice" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "RetailSale" ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "approvedByName" TEXT;

-- CreateTable
CREATE TABLE "RetailDepositKind" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailDepositKind_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RetailDepositKind_amount_positive" CHECK ("amount" > 0)
);

-- CreateTable
CREATE TABLE "RetailEmptiesEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "saleId" TEXT,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "depositAmount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailEmptiesEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RetailEmptiesEntry_quantity_nonzero" CHECK ("quantity" <> 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "RetailDepositKind_companyId_amount_key" ON "RetailDepositKind"("companyId", "amount");

-- CreateIndex
CREATE INDEX "RetailEmptiesEntry_companyId_supplierId_idx" ON "RetailEmptiesEntry"("companyId", "supplierId");

-- CreateIndex
CREATE INDEX "RetailEmptiesEntry_saleId_idx" ON "RetailEmptiesEntry"("saleId");

-- AddForeignKey
ALTER TABLE "RetailSale" ADD CONSTRAINT "RetailSale_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailDepositKind" ADD CONSTRAINT "RetailDepositKind_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailEmptiesEntry" ADD CONSTRAINT "RetailEmptiesEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailEmptiesEntry" ADD CONSTRAINT "RetailEmptiesEntry_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailEmptiesEntry" ADD CONSTRAINT "RetailEmptiesEntry_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailEmptiesEntry" ADD CONSTRAINT "RetailEmptiesEntry_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "RetailSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailEmptiesEntry" ADD CONSTRAINT "RetailEmptiesEntry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
