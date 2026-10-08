-- FLR-01: who a sale was rung for, who approved a refund or void, and whether a refund went back on the shelf.

-- AlterTable
ALTER TABLE "RetailSale" ADD COLUMN "customerId" TEXT,
ADD COLUMN "restocked" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "RetailSale_companyId_customerId_idx" ON "RetailSale"("companyId", "customerId");

-- CreateIndex
CREATE INDEX "RetailSale_companyId_saleType_postedAt_idx" ON "RetailSale"("companyId", "saleType", "postedAt");

-- AddForeignKey
ALTER TABLE "RetailSale" ADD CONSTRAINT "RetailSale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A sale rung for a name that is exactly one live customer of the shop is theirs.
UPDATE "RetailSale" s
SET "customerId" = c."id"
FROM "Customer" c
WHERE s."customerId" IS NULL
  AND s."customerName" IS NOT NULL
  AND c."companyId" = s."companyId"
  AND c."isActive" = true
  AND c."name" = s."customerName"
  AND (
    SELECT count(*) FROM "Customer" o
    WHERE o."companyId" = s."companyId" AND o."isActive" = true AND o."name" = s."customerName"
  ) = 1;

-- "Rang up wrong (approved by Tafara Nyathi)": the approver gets their own column, the reason loses the suffix.
UPDATE "RetailSale"
SET "approvedByName" = substring("overrideReason" from '\(approved by ([^()]+)\)\s*$'),
    "overrideReason" = NULLIF(btrim(regexp_replace("overrideReason", '\s*\(approved by [^()]+\)\s*$', '')), '')
WHERE "overrideReason" ~ '\(approved by [^()]+\)\s*$';
