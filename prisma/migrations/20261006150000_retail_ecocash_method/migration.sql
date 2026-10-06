-- Payments › EcoCash: "Customers pay by" a merchant code, money sent to the
-- shop's EcoCash number, or a terminal at the counter. Shops before this paid
-- by merchant code.
CREATE TYPE "RetailEcocashMethod" AS ENUM ('MERCHANT_CODE', 'PHONE_NUMBER', 'TERMINAL');

ALTER TABLE "RetailPaymentSettings" ADD COLUMN "ecocashMethod" "RetailEcocashMethod" NOT NULL DEFAULT 'MERCHANT_CODE';
ALTER TABLE "RetailPaymentSettings" ADD COLUMN "ecocashPhone" TEXT;
