-- CUS-01: the customer record the Customers area reads (60-customers §3.1).
-- A code "CUS-00141" and a card number per company, the WhatsApp number, area,
-- birthday, marketing consent, a held tier, a price list, the bin and merges,
-- and notes. Existing customers are numbered in the order they were created,
-- and their phones written one way: +263 for a Zimbabwean number.

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "area" TEXT,
ADD COLUMN     "cardNo" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "consentChangedAt" TIMESTAMP(3),
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "dateOfBirth" DATE,
ADD COLUMN     "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mergedIntoId" TEXT,
ADD COLUMN     "priceListId" TEXT,
ADD COLUMN     "tierHeld" TEXT,
ADD COLUMN     "tierHeldUntil" DATE,
ADD COLUMN     "whatsapp" TEXT;

-- CreateTable
CREATE TABLE "RetailCustomerNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "RetailCustomerNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RetailCustomerNote_customerId_createdAt_idx" ON "RetailCustomerNote"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Customer_companyId_phone_idx" ON "Customer"("companyId", "phone");

-- CreateIndex
CREATE INDEX "Customer_companyId_archivedAt_idx" ON "Customer"("companyId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_companyId_code_key" ON "Customer"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_companyId_cardNo_key" ON "Customer"("companyId", "cardNo");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailCustomerNote" ADD CONSTRAINT "RetailCustomerNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailCustomerNote" ADD CONSTRAINT "RetailCustomerNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailCustomerNote" ADD CONSTRAINT "RetailCustomerNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Number every customer per company in the order they were created; the card follows the code.
WITH numbered AS (
  SELECT "id", row_number() OVER (PARTITION BY "companyId" ORDER BY "createdAt", "id") AS n
  FROM "Customer"
)
UPDATE "Customer" AS c
SET "code" = 'CUS-' || lpad(numbered.n::text, 5, '0'),
    "cardNo" = '600914' || lpad(numbered.n::text, 6, '0')
FROM numbered
WHERE numbered."id" = c."id";

-- Phones without spaces or dashes; a leading 0 or 263 becomes +263.
UPDATE "Customer"
SET "phone" = CASE
  WHEN regexp_replace("phone", '[[:space:]-]', '', 'g') LIKE '0%'
    THEN '+263' || substr(regexp_replace("phone", '[[:space:]-]', '', 'g'), 2)
  WHEN regexp_replace("phone", '[[:space:]-]', '', 'g') LIKE '263%'
    THEN '+' || regexp_replace("phone", '[[:space:]-]', '', 'g')
  ELSE regexp_replace("phone", '[[:space:]-]', '', 'g')
END
WHERE "phone" IS NOT NULL;
