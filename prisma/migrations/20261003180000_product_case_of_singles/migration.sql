-- AlterTable
ALTER TABLE "Product" ADD COLUMN "packOfId" TEXT,
ADD COLUMN "packSize" INTEGER;

-- CreateIndex
CREATE INDEX "Product_packOfId_idx" ON "Product"("packOfId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_packOfId_fkey" FOREIGN KEY ("packOfId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A case holds more than one single, and is not a case of itself.
ALTER TABLE "Product" ADD CONSTRAINT "Product_packSize_more_than_one" CHECK ("packSize" IS NULL OR "packSize" > 1);
ALTER TABLE "Product" ADD CONSTRAINT "Product_pack_not_itself" CHECK ("packOfId" IS NULL OR "packOfId" <> "id");
