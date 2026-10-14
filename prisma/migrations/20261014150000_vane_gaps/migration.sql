-- What the built Vane pages still lacked: who paused Vane ("Paused by James"), a card's topic and
-- each person's stopped topics ("Stop it for me"), the question behind a job Vane could not work
-- out ("Show the rows"), and the catalogue product on a quote line (the price check).
-- AlterTable
ALTER TABLE "SalesQuotationLine" ADD COLUMN     "productId" TEXT;

-- AlterTable
ALTER TABLE "VaneItem" ADD COLUMN     "topic" TEXT;

-- AlterTable
ALTER TABLE "VaneJob" ADD COLUMN     "problemSql" TEXT;

-- AlterTable
ALTER TABLE "VaneSettings" ADD COLUMN     "pausedById" TEXT;

-- CreateTable
CREATE TABLE "VaneTopicStop" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaneTopicStop_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VaneTopicStop_userId_idx" ON "VaneTopicStop"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VaneTopicStop_companyId_userId_topic_key" ON "VaneTopicStop"("companyId", "userId", "topic");

-- CreateIndex
CREATE INDEX "SalesQuotationLine_productId_idx" ON "SalesQuotationLine"("productId");

-- CreateIndex
CREATE INDEX "VaneSettings_pausedById_idx" ON "VaneSettings"("pausedById");

-- AddForeignKey
ALTER TABLE "SalesQuotationLine" ADD CONSTRAINT "SalesQuotationLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaneTopicStop" ADD CONSTRAINT "VaneTopicStop_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaneTopicStop" ADD CONSTRAINT "VaneTopicStop_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaneSettings" ADD CONSTRAINT "VaneSettings_pausedById_fkey" FOREIGN KEY ("pausedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Vane's reader reaches the new columns and VaneTopicStop, as `pnpm vane:reader-sql` prints them.
ALTER TABLE "VaneTopicStop" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "VaneTopicStop" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "VaneTopicStop" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "userId", "topic", "createdAt") ON "VaneTopicStop" TO vane_reader;
GRANT SELECT ("productId") ON "SalesQuotationLine" TO vane_reader;
GRANT SELECT ("topic") ON "VaneItem" TO vane_reader;
GRANT SELECT ("problemSql") ON "VaneJob" TO vane_reader;
GRANT SELECT ("pausedById") ON "VaneSettings" TO vane_reader;
