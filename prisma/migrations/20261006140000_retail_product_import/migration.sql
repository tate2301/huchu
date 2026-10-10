-- SET-11: import products from a spreadsheet (W-08). Rows are checked and fixed in place, then imported in one go.
-- CreateEnum
CREATE TYPE "RetailImportStatus" AS ENUM ('CHECKING', 'IMPORTED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "RetailImportAction" AS ENUM ('NEW', 'UPDATE');

-- CreateEnum
CREATE TYPE "RetailImportProblem" AS ENUM ('NO_NAME', 'NO_PRICE', 'PRICE_COMMA', 'PRICE_NOT_NUMBER', 'NEW_CATEGORY', 'BARCODE_SHORT', 'BARCODE_LONG', 'BARCODE_LETTERS', 'DUPLICATE_IN_FILE', 'LOOKS_LIKE');

-- CreateTable
CREATE TABLE "RetailImport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "status" "RetailImportStatus" NOT NULL DEFAULT 'CHECKING',
    "siteId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedAt" TIMESTAMP(3),
    "importedById" TEXT,
    "createdCount" INTEGER,
    "updatedCount" INTEGER,
    "skippedCount" INTEGER,

    CONSTRAINT "RetailImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailImportRow" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "rowNo" INTEGER NOT NULL,
    "name" TEXT,
    "category" TEXT,
    "price" TEXT,
    "barcode" TEXT,
    "cost" TEXT,
    "supplier" TEXT,
    "packSize" TEXT,
    "openingStock" TEXT,
    "action" "RetailImportAction",
    "matchedProductId" TEXT,
    "problems" "RetailImportProblem"[] DEFAULT ARRAY[]::"RetailImportProblem"[],
    "problemArgs" JSONB,

    CONSTRAINT "RetailImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RetailImport_companyId_status_createdAt_idx" ON "RetailImport"("companyId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RetailImportRow_importId_rowNo_key" ON "RetailImportRow"("importId", "rowNo");

-- AddForeignKey
ALTER TABLE "RetailImport" ADD CONSTRAINT "RetailImport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailImport" ADD CONSTRAINT "RetailImport_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailImportRow" ADD CONSTRAINT "RetailImportRow_importId_fkey" FOREIGN KEY ("importId") REFERENCES "RetailImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

