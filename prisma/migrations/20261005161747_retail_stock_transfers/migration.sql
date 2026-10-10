-- STK-07: transfers of stock between two sites of a shop (W-24).

-- CreateEnum
CREATE TYPE "RetailStockTransferStatus" AS ENUM ('ON_THE_WAY', 'RECEIVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "RetailStockTransfer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "transferNo" TEXT NOT NULL,
    "fromSiteId" TEXT NOT NULL,
    "toSiteId" TEXT NOT NULL,
    "status" "RetailStockTransferStatus" NOT NULL DEFAULT 'ON_THE_WAY',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentById" TEXT NOT NULL,
    "driver" TEXT,
    "vehicle" TEXT,
    "arrives" TEXT,
    "note" TEXT,
    "receivedAt" TIMESTAMP(3),
    "receivedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailStockTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailStockTransferLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "fromItemId" TEXT NOT NULL,
    "toItemId" TEXT,
    "quantitySent" DECIMAL(12,4) NOT NULL,
    "quantityReceived" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "quantityLost" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailStockTransferLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RetailStockTransfer_companyId_status_sentAt_idx" ON "RetailStockTransfer"("companyId", "status", "sentAt");

-- CreateIndex
CREATE INDEX "RetailStockTransfer_companyId_fromSiteId_toSiteId_idx" ON "RetailStockTransfer"("companyId", "fromSiteId", "toSiteId");

-- CreateIndex
CREATE UNIQUE INDEX "RetailStockTransfer_companyId_transferNo_key" ON "RetailStockTransfer"("companyId", "transferNo");

-- CreateIndex
CREATE INDEX "RetailStockTransferLine_companyId_productId_idx" ON "RetailStockTransferLine"("companyId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "RetailStockTransferLine_transferId_productId_key" ON "RetailStockTransferLine"("transferId", "productId");

-- AddForeignKey
ALTER TABLE "RetailStockTransfer" ADD CONSTRAINT "RetailStockTransfer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailStockTransfer" ADD CONSTRAINT "RetailStockTransfer_fromSiteId_fkey" FOREIGN KEY ("fromSiteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailStockTransfer" ADD CONSTRAINT "RetailStockTransfer_toSiteId_fkey" FOREIGN KEY ("toSiteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailStockTransfer" ADD CONSTRAINT "RetailStockTransfer_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailStockTransfer" ADD CONSTRAINT "RetailStockTransfer_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailStockTransfer" ADD CONSTRAINT "RetailStockTransfer_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailStockTransferLine" ADD CONSTRAINT "RetailStockTransferLine_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "RetailStockTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailStockTransferLine" ADD CONSTRAINT "RetailStockTransferLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailStockTransferLine" ADD CONSTRAINT "RetailStockTransferLine_fromItemId_fkey" FOREIGN KEY ("fromItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailStockTransferLine" ADD CONSTRAINT "RetailStockTransferLine_toItemId_fkey" FOREIGN KEY ("toItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- A transfer goes from one site to another, never to the site it left.
ALTER TABLE "RetailStockTransfer" ADD CONSTRAINT "RetailStockTransfer_sites_differ" CHECK ("fromSiteId" <> "toSiteId");
