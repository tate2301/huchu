-- CUS-06: messages to customers on WhatsApp (55-customers-message).
-- What a send is for, one batch per send (the template as typed, who it went
-- to, when), and each outbox message's customer and batch. Both links let go
-- (SET NULL): binning a customer or a batch keeps the outbox's history.

-- CreateEnum
CREATE TYPE "RetailMessagePurpose" AS ENUM ('OFFER', 'ACCOUNT_REMINDER', 'LAYBY_REMINDER', 'STATEMENT');

-- AlterTable
ALTER TABLE "RetailMessage" ADD COLUMN     "batchId" TEXT,
ADD COLUMN     "customerId" TEXT;

-- CreateTable
CREATE TABLE "RetailMessageBatch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "purpose" "RetailMessagePurpose" NOT NULL,
    "audience" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3),
    "total" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailMessageBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RetailMessageBatch_companyId_createdAt_idx" ON "RetailMessageBatch"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "RetailMessage_customerId_createdAt_idx" ON "RetailMessage"("customerId", "createdAt");

-- AddForeignKey
ALTER TABLE "RetailMessage" ADD CONSTRAINT "RetailMessage_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailMessage" ADD CONSTRAINT "RetailMessage_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "RetailMessageBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailMessageBatch" ADD CONSTRAINT "RetailMessageBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailMessageBatch" ADD CONSTRAINT "RetailMessageBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
