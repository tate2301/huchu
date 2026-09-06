-- Rollback procedure:
--   DROP TABLE IF EXISTS "GoldCompanyConfig";
--   ALTER TABLE "GoldPurchase" DROP COLUMN IF EXISTS "attachmentsJson";

-- GoldCompanyConfig: 1:1 per-company defaults for the Gold module
CREATE TABLE "GoldCompanyConfig" (
    "companyId"                       TEXT         NOT NULL,
    "defaultSplitMode"                TEXT         NOT NULL DEFAULT 'DEFAULT_50_50',
    "defaultPayCycleWeeks"            INTEGER      NOT NULL DEFAULT 2,
    "defaultStorageLocation"          TEXT         NOT NULL DEFAULT 'Vault A',
    "defaultEstimatedPurity"          DECIMAL(5,2) NOT NULL DEFAULT 92.5,
    "liveSpotPriceEnabled"            BOOLEAN      NOT NULL DEFAULT false,
    "liveSpotPriceProvider"           TEXT,
    "importCommitCoSignThresholdRows" INTEGER      NOT NULL DEFAULT 100,
    "importCommitCoSignThresholdUsd"  DECIMAL(14,2) NOT NULL DEFAULT 10000,
    "createdAt"                       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"                       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoldCompanyConfig_pkey" PRIMARY KEY ("companyId")
);

ALTER TABLE "GoldCompanyConfig"
    ADD CONSTRAINT "GoldCompanyConfig_companyId_fkey"
    FOREIGN KEY ("companyId")
    REFERENCES "Company"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- GoldPurchase.attachmentsJson: per-purchase attachment URLs (paper receipt scans, photos)
ALTER TABLE "GoldPurchase" ADD COLUMN "attachmentsJson" TEXT;
