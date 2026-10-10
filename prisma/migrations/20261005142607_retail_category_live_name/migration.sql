-- PRD-02 (20-products W-19): a category's name is unique among the shop's
-- live categories, whatever its case. A deleted one waits in the bin under
-- its name without holding it, so "Mixers" can be added again; restoring the
-- binned one is refused while a live one has its name.
DROP INDEX "RetailCategory_companyId_name_key";

CREATE UNIQUE INDEX "RetailCategory_live_name_key"
    ON "RetailCategory" ("companyId", lower("name"))
    WHERE "archivedAt" IS NULL;
