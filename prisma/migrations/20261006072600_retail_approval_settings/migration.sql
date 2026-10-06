-- ADM-04: Management › Approvals. One row per company; no row reads as the defaults.

CREATE TYPE "RetailPriceChangeRule" AS ENUM ('MANAGERS', 'OWNER');

CREATE TYPE "RetailCountApprovalRule" AS ENUM ('ANY_MANAGER', 'OWNER_OVER_LIMIT');

CREATE TYPE "RetailApprovalChannel" AS ENUM ('APP', 'WHATSAPP_AND_APP');

CREATE TABLE "RetailApprovalSettings" (
    "companyId" TEXT NOT NULL,
    "requisitionOwnerOver" DECIMAL(14,2) NOT NULL DEFAULT 500,
    "ownerApproverId" TEXT,
    "priceChanges" "RetailPriceChangeRule" NOT NULL DEFAULT 'MANAGERS',
    "belowCostNeedsOwner" BOOLEAN NOT NULL DEFAULT true,
    "adjustmentPinOver" DECIMAL(14,2) NOT NULL DEFAULT 50,
    "countDifferences" "RetailCountApprovalRule" NOT NULL DEFAULT 'OWNER_OVER_LIMIT',
    "countOwnerOver" DECIMAL(14,2) NOT NULL DEFAULT 100,
    "accountOwnerOver" DECIMAL(14,2) NOT NULL DEFAULT 250,
    "askBy" "RetailApprovalChannel" NOT NULL DEFAULT 'WHATSAPP_AND_APP',
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailApprovalSettings_pkey" PRIMARY KEY ("companyId")
);

ALTER TABLE "RetailApprovalSettings" ADD CONSTRAINT "RetailApprovalSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RetailApprovalSettings" ADD CONSTRAINT "RetailApprovalSettings_ownerApproverId_fkey" FOREIGN KEY ("ownerApproverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RetailApprovalSettings" ADD CONSTRAINT "RetailApprovalSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
