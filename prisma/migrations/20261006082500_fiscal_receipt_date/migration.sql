-- SET-08: a fiscal receipt keeps the date it was signed with, apart from its sale's own time.
ALTER TABLE "FiscalReceipt" ADD COLUMN "receiptDate" TIMESTAMP(3);

-- Till receipts signed so far were dated with their sale's postedAt (or createdAt when it had none).
UPDATE "FiscalReceipt" AS fr
   SET "receiptDate" = COALESCE(rs."postedAt", rs."createdAt")
  FROM "RetailSale" AS rs
 WHERE fr."retailSaleId" = rs."id"
   AND fr."receiptHash" IS NOT NULL;
