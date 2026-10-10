-- PRD-06: shelf labels go to a till's printer as a job the till pulls, or open here as a PDF.

-- CreateEnum
CREATE TYPE "RetailPrintJobKind" AS ENUM ('LABELS');

-- CreateEnum
CREATE TYPE "RetailPrintJobStatus" AS ENUM ('QUEUED', 'PRINTED', 'FAILED');

-- CreateTable
CREATE TABLE "RetailPrintJob" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "registerId" TEXT,
    "kind" "RetailPrintJobKind" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "RetailPrintJobStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "printedAt" TIMESTAMP(3),

    CONSTRAINT "RetailPrintJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RetailPrintJob_registerId_status_createdAt_idx" ON "RetailPrintJob"("registerId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "RetailPrintJob" ADD CONSTRAINT "RetailPrintJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailPrintJob" ADD CONSTRAINT "RetailPrintJob_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "RetailRegister"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailPrintJob" ADD CONSTRAINT "RetailPrintJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
