-- BUY-01 (40-buying 3.3 A): a supplier is a `Vendor`, with the shop's terms,
-- its WhatsApp number and its people; a message knows what it is about.

CREATE TYPE "RetailMessageDirection" AS ENUM ('OUT', 'IN');
CREATE TYPE "VendorContactSends" AS ENUM ('ORDERS', 'STATEMENTS', 'NOTHING');

-- A message sent or received, and the record it belongs to (moved here from
-- migration B so the first supplier messages are linked).
ALTER TABLE "RetailMessage" ADD COLUMN "direction" "RetailMessageDirection" NOT NULL DEFAULT 'OUT',
ADD COLUMN "entityId" TEXT,
ADD COLUMN "entityType" TEXT,
ADD COLUMN "fromNumber" TEXT;
CREATE INDEX "RetailMessage_companyId_entityType_entityId_createdAt_idx" ON "RetailMessage"("companyId", "entityType", "entityId", "createdAt");

ALTER TABLE "Vendor" ADD COLUMN "bankDetails" TEXT,
ADD COLUMN "code" TEXT,
ADD COLUMN "createdById" TEXT,
ADD COLUMN "deliversOn" TEXT,
ADD COLUMN "leadTimeDays" INTEGER,
ADD COLUMN "minimumOrder" DECIMAL(14,2),
ADD COLUMN "payTermsDays" INTEGER,
ADD COLUMN "sendOrdersOnWhatsapp" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "stoppedAt" TIMESTAMP(3),
ADD COLUMN "stoppedById" TEXT,
ADD COLUMN "whatsapp" TEXT;

CREATE TABLE "VendorContact" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "sends" "VendorContactSends" NOT NULL DEFAULT 'ORDERS',
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorContact_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VendorContact_vendorId_idx" ON "VendorContact"("vendorId");
CREATE INDEX "VendorContact_companyId_idx" ON "VendorContact"("companyId");

-- Orders go to the WhatsApp number, which starts as the phone.
UPDATE "Vendor" SET "whatsapp" = "phone";

-- Every supplier already kept gets its number, per company in the order they were added.
UPDATE "Vendor" AS v SET "code" = numbered.code
FROM (
  SELECT "id", 'SUP-' || lpad(row_number() OVER (PARTITION BY "companyId" ORDER BY "createdAt", "id")::text, 4, '0') AS code
  FROM "Vendor"
) AS numbered
WHERE numbered."id" = v."id";

CREATE UNIQUE INDEX "Vendor_companyId_code_key" ON "Vendor"("companyId", "code");

-- A supplier's named contact becomes its sales rep, who gets the orders.
INSERT INTO "VendorContact" ("id", "companyId", "vendorId", "name", "role", "phone", "email", "sends", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "companyId", "id", btrim("contactName"), 'Sales rep', "phone", "email", 'ORDERS', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Vendor"
WHERE "contactName" IS NOT NULL AND btrim("contactName") <> '';

ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_stoppedById_fkey" FOREIGN KEY ("stoppedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VendorContact" ADD CONSTRAINT "VendorContact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorContact" ADD CONSTRAINT "VendorContact_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
