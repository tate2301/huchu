-- PRD-10: vouchers (gift vouchers, credit notes, discount vouchers), their uses, the sale's
-- vouchers sold and discount voucher, the payment's voucher, and their posting roles and sources.
-- CreateEnum
CREATE TYPE "RetailVoucherKind" AS ENUM ('GIFT', 'CREDIT_NOTE', 'DISCOUNT');

-- CreateEnum
CREATE TYPE "RetailVoucherFunding" AS ENUM ('SOLD', 'GIVEN', 'REFUND');

-- CreateEnum
CREATE TYPE "RetailVoucherSendBy" AS ENUM ('PRINT', 'WHATSAPP', 'BOTH');

-- AlterEnum


ALTER TYPE "RetailAccountRole" ADD VALUE 'VOUCHERS_OWED';
ALTER TYPE "RetailAccountRole" ADD VALUE 'PROMOTIONS_GIVEN';
ALTER TYPE "RetailAccountRole" ADD VALUE 'OTHER_INCOME';

-- AlterEnum


ALTER TYPE "AccountingSourceType" ADD VALUE 'RETAIL_VOUCHER_ISSUE';
ALTER TYPE "AccountingSourceType" ADD VALUE 'RETAIL_VOUCHER_EXPIRY';
ALTER TYPE "AccountingSourceType" ADD VALUE 'RETAIL_VOUCHER_VOID';

-- AlterTable
ALTER TABLE "RetailSale" ADD COLUMN     "discountVoucherId" TEXT,
ADD COLUMN     "vouchersSoldAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "RetailSalePayment" ADD COLUMN     "voucherId" TEXT;

-- CreateTable
CREATE TABLE "RetailVoucher" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "kind" "RetailVoucherKind" NOT NULL,
    "funding" "RetailVoucherFunding" NOT NULL,
    "value" DECIMAL(14,2),
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "percentOff" DECIMAL(5,2),
    "amountOff" DECIMAL(14,2),
    "copies" INTEGER NOT NULL DEFAULT 1,
    "usesLeft" INTEGER,
    "customerId" TEXT,
    "holderNote" TEXT,
    "minSale" DECIMAL(14,2),
    "expiresOn" DATE NOT NULL,
    "siteId" TEXT,
    "sendBy" "RetailVoucherSendBy" NOT NULL DEFAULT 'PRINT',
    "sentAt" TIMESTAMP(3),
    "soldSaleId" TEXT,
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiredAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "wrongSecrets" INTEGER NOT NULL DEFAULT 0,
    "wrongSince" TIMESTAMPTZ(3),
    "lockedUntil" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailVoucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailVoucherUse" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "balanceAfter" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailVoucherUse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RetailVoucher_companyId_kind_expiresOn_idx" ON "RetailVoucher"("companyId", "kind", "expiresOn");

-- CreateIndex
CREATE INDEX "RetailVoucher_customerId_idx" ON "RetailVoucher"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "RetailVoucher_companyId_code_key" ON "RetailVoucher"("companyId", "code");

-- CreateIndex
CREATE INDEX "RetailVoucherUse_voucherId_createdAt_idx" ON "RetailVoucherUse"("voucherId", "createdAt");

-- CreateIndex
CREATE INDEX "RetailVoucherUse_saleId_idx" ON "RetailVoucherUse"("saleId");

-- AddForeignKey
ALTER TABLE "RetailVoucher" ADD CONSTRAINT "RetailVoucher_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailVoucher" ADD CONSTRAINT "RetailVoucher_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailVoucher" ADD CONSTRAINT "RetailVoucher_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailVoucher" ADD CONSTRAINT "RetailVoucher_soldSaleId_fkey" FOREIGN KEY ("soldSaleId") REFERENCES "RetailSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailVoucher" ADD CONSTRAINT "RetailVoucher_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailVoucher" ADD CONSTRAINT "RetailVoucher_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailVoucherUse" ADD CONSTRAINT "RetailVoucherUse_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailVoucherUse" ADD CONSTRAINT "RetailVoucherUse_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "RetailVoucher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailVoucherUse" ADD CONSTRAINT "RetailVoucherUse_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "RetailSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailSale" ADD CONSTRAINT "RetailSale_discountVoucherId_fkey" FOREIGN KEY ("discountVoucherId") REFERENCES "RetailVoucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailSalePayment" ADD CONSTRAINT "RetailSalePayment_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "RetailVoucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Data: the VOUCHER tender settles to 2250 "Vouchers issued" (what the shop owes the
-- holder). A company whose VOUCHER mapping still points at 1018 Voucher Clearing moves
-- to its 2250. Expected to match no row (SET-09 already maps VOUCHER to 2250).
UPDATE "TenderAccountMapping" AS m
SET "clearingAccountId" = target."id", "updatedAt" = CURRENT_TIMESTAMP
FROM "ChartOfAccount" AS current_account, "ChartOfAccount" AS target
WHERE m."tenderType" = 'VOUCHER'
  AND current_account."id" = m."clearingAccountId"
  AND current_account."code" = '1018'
  AND target."companyId" = m."companyId"
  AND target."code" = '2250';
