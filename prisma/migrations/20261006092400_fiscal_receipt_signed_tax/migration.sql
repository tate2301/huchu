-- SET-08: a till receipt keeps the tax it was signed with, so a resend and the day's Z-report never re-read the catalogue.
ALTER TABLE "FiscalReceipt" ADD COLUMN "signedTax" JSONB;
