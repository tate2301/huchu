-- SET-07: Receipts and the message outbox. One typed row per company says what
-- every till receipt carries; RetailMessage is the outbox the worker drains
-- (one attachment column set, C-02; scheduledFor, C-03; Meta's id for status callbacks).

-- CreateEnum
CREATE TYPE "RetailReceiptSendBy" AS ENUM ('NOTHING', 'WHATSAPP', 'EMAIL');

-- CreateEnum
CREATE TYPE "RetailMessageChannel" AS ENUM ('WHATSAPP', 'EMAIL');

-- CreateEnum
CREATE TYPE "RetailMessageStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "RetailMessageMediaKind" AS ENUM ('IMAGE', 'DOCUMENT');

-- CreateTable
CREATE TABLE "RetailReceiptSettings" (
    "companyId" TEXT NOT NULL,
    "header" TEXT,
    "footer" TEXT,
    "showVatNumber" BOOLEAN NOT NULL DEFAULT true,
    "showLicenceNumber" BOOLEAN NOT NULL DEFAULT true,
    "printLogo" BOOLEAN NOT NULL DEFAULT false,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "alsoSendBy" "RetailReceiptSendBy" NOT NULL DEFAULT 'NOTHING',
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailReceiptSettings_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "RetailMessage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "channel" "RetailMessageChannel" NOT NULL,
    "to" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "saleId" TEXT,
    "mediaUrl" TEXT,
    "mediaName" TEXT,
    "mediaKind" "RetailMessageMediaKind",
    "scheduledFor" TIMESTAMP(3),
    "status" "RetailMessageStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "externalId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RetailMessage_companyId_status_createdAt_idx" ON "RetailMessage"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "RetailMessage_status_scheduledFor_idx" ON "RetailMessage"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "RetailMessage_saleId_idx" ON "RetailMessage"("saleId");

-- CreateIndex
CREATE INDEX "RetailMessage_externalId_idx" ON "RetailMessage"("externalId");

-- AddForeignKey
ALTER TABLE "RetailReceiptSettings" ADD CONSTRAINT "RetailReceiptSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailReceiptSettings" ADD CONSTRAINT "RetailReceiptSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailMessage" ADD CONSTRAINT "RetailMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailMessage" ADD CONSTRAINT "RetailMessage_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "RetailSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

