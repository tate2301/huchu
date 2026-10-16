-- The workspace's owner can void a receipt in Books (approved 16 Oct, the owner's request):
-- the receipt stays, marked void with who, when and why, and stops counting as money in.
-- Its posting is reversed under `void:<id>` (lib/books/void-receipt.ts); nothing else changes shape.
-- AlterTable
ALTER TABLE "SalesReceipt" ADD COLUMN "voidedAt" TIMESTAMP(3),
ADD COLUMN "voidedById" TEXT,
ADD COLUMN "voidReason" TEXT;

-- AddForeignKey
ALTER TABLE "SalesReceipt" ADD CONSTRAINT "SalesReceipt_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Vane's reader reaches the new columns, as `pnpm vane:reader-sql` prints them.
GRANT SELECT ("voidedAt", "voidedById", "voidReason") ON "SalesReceipt" TO vane_reader;

-- Explore's reader too, as `pnpm explore:reader-sql` prints them, so a question can leave void receipts out.
GRANT SELECT ("voidedAt", "voidedById", "voidReason") ON "SalesReceipt" TO explore_reader;
