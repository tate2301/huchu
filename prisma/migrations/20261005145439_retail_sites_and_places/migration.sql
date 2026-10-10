-- SET-02: a site carries what a shop needs — its phone, its opening hours,
-- the price list its tills sell from, and when and by whom it was closed.
-- The places inside a site (`StockLocation`) keep the owner's order.

ALTER TABLE "Site"
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "openingHours" TEXT,
  ADD COLUMN "priceListId" TEXT,
  ADD COLUMN "closedAt" TIMESTAMP(3),
  ADD COLUMN "closedById" TEXT;

ALTER TABLE "Site"
  ADD CONSTRAINT "Site_priceListId_fkey"
  FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Site"
  ADD CONSTRAINT "Site_closedById_fkey"
  FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StockLocation"
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
