-- STK-09: the Empties ledger. Every empty bottle and crate in or out of the store
-- and every deposit held for customers or owed by suppliers, one running balance
-- per site. It replaces the till's per-supplier empties table (a bottle store's
-- empties go back to whichever supplier the shop books them to, not the product's),
-- whose rows are dropped with it.

-- DropTable
DROP TABLE "RetailEmptiesEntry";

-- CreateEnum
CREATE TYPE "RetailEmptiesKind" AS ENUM ('DEPOSIT_CHARGED', 'DEPOSIT_REFUNDED', 'BOTTLES_BACK', 'RETURNED_TO_SUPPLIER', 'CREDIT_RECEIVED');

-- AlterEnum
ALTER TYPE "RetailCashMovementReason" ADD VALUE 'BOTTLES_BACK';

-- AlterEnum
ALTER TYPE "AccountingSourceType" ADD VALUE 'RETAIL_BOTTLES_BACK';

-- AlterTable
ALTER TABLE "RetailShopProfile" ADD COLUMN     "bottleDeposit" DECIMAL(14,2) NOT NULL DEFAULT 0.10,
ADD COLUMN     "crateDeposit" DECIMAL(14,2) NOT NULL DEFAULT 3.00;

-- CreateTable
CREATE TABLE "RetailEmptiesEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "kind" "RetailEmptiesKind" NOT NULL,
    "bottles" INTEGER NOT NULL DEFAULT 0,
    "crates" INTEGER NOT NULL DEFAULT 0,
    "deposit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bottlesAfter" INTEGER NOT NULL,
    "cratesAfter" INTEGER NOT NULL,
    "saleId" TEXT,
    "customerId" TEXT,
    "supplierId" TEXT,
    "supplierName" TEXT,
    "goodsReceiptId" TEXT,
    "returnId" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailEmptiesEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RetailEmptiesEntry_companyId_createdAt_idx" ON "RetailEmptiesEntry"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "RetailEmptiesEntry_companyId_kind_createdAt_idx" ON "RetailEmptiesEntry"("companyId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "RetailEmptiesEntry_siteId_createdAt_idx" ON "RetailEmptiesEntry"("siteId", "createdAt");

-- CreateIndex
CREATE INDEX "RetailEmptiesEntry_supplierId_idx" ON "RetailEmptiesEntry"("supplierId");

-- AddForeignKey
ALTER TABLE "RetailEmptiesEntry" ADD CONSTRAINT "RetailEmptiesEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailEmptiesEntry" ADD CONSTRAINT "RetailEmptiesEntry_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailEmptiesEntry" ADD CONSTRAINT "RetailEmptiesEntry_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "RetailSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailEmptiesEntry" ADD CONSTRAINT "RetailEmptiesEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailEmptiesEntry" ADD CONSTRAINT "RetailEmptiesEntry_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailEmptiesEntry" ADD CONSTRAINT "RetailEmptiesEntry_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "RetailGoodsReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailEmptiesEntry" ADD CONSTRAINT "RetailEmptiesEntry_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "RetailEmptiesEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailEmptiesEntry" ADD CONSTRAINT "RetailEmptiesEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
