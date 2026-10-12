-- CUS-05: merging a duplicate customer (W-45) and undoing it from the bin
-- (W-63). One row per duplicate merged away, listing every sale, lay-by,
-- voucher and note it moved to the survivor, the survivor's fields it filled
-- and the phone it replaced, so a restore moves back exactly those.

-- CreateTable
CREATE TABLE "RetailCustomerMerge" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "survivorId" TEXT NOT NULL,
    "duplicateId" TEXT NOT NULL,
    "survivorPhoneBefore" TEXT,
    "filledFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "saleIds" TEXT[],
    "laybyIds" TEXT[],
    "voucherIds" TEXT[],
    "noteIds" TEXT[],
    "accountMoved" BOOLEAN NOT NULL DEFAULT false,
    "points" INTEGER NOT NULL,
    "visits" INTEGER NOT NULL,
    "mergedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),
    "undoneById" TEXT,

    CONSTRAINT "RetailCustomerMerge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RetailCustomerMerge_duplicateId_key" ON "RetailCustomerMerge"("duplicateId");

-- CreateIndex
CREATE INDEX "RetailCustomerMerge_companyId_survivorId_idx" ON "RetailCustomerMerge"("companyId", "survivorId");

-- AddForeignKey
ALTER TABLE "RetailCustomerMerge" ADD CONSTRAINT "RetailCustomerMerge_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailCustomerMerge" ADD CONSTRAINT "RetailCustomerMerge_survivorId_fkey" FOREIGN KEY ("survivorId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailCustomerMerge" ADD CONSTRAINT "RetailCustomerMerge_duplicateId_fkey" FOREIGN KEY ("duplicateId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
