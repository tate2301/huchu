-- ADM-02 People (80-admin 3.3): a person is a User of the tenant with a phone,
-- an email only when they sign in to the admin, a role, sites (all, or a list)
-- and an optional till PIN, issued from People.

-- Notification values the admin area uses, here in its first migration so
-- every later unit has them. IF NOT EXISTS: the floor's staff message may
-- have added RETAIL_STAFF_MESSAGE first.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'RETAIL_PRICE_APPROVAL';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'RETAIL_PRICE_DECIDED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'RETAIL_PIN_LOCKED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'RETAIL_SUPPORT';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'RETAIL_STAFF_MESSAGE';
ALTER TYPE "NotificationEntityType" ADD VALUE IF NOT EXISTS 'RETAIL_PRICE_APPROVAL';
ALTER TYPE "NotificationEntityType" ADD VALUE IF NOT EXISTS 'RETAIL_PERSON';
ALTER TYPE "NotificationEntityType" ADD VALUE IF NOT EXISTS 'RETAIL_SETTINGS';

-- Someone who only uses a till has no email.
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "allSites" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "accessRemovedAt" TIMESTAMP(3),
ADD COLUMN "accessRemovedById" TEXT;
UPDATE "User" SET "phone" = NULL WHERE btrim("phone") = '';
CREATE INDEX "User_companyId_phone_idx" ON "User"("companyId", "phone");
ALTER TABLE "User" ADD CONSTRAINT "User_accessRemovedById_fkey" FOREIGN KEY ("accessRemovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A PIN issued from People: the person chooses their own on first use.
ALTER TABLE "RetailTillPin" ADD COLUMN "mustChange" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "issuedById" TEXT;
UPDATE "RetailTillPin" SET "issuedAt" = "createdAt";
ALTER TABLE "RetailTillPin" ADD CONSTRAINT "RetailTillPin_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "UserSiteAccess" (
    "userId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSiteAccess_pkey" PRIMARY KEY ("userId","siteId")
);
CREATE INDEX "UserSiteAccess_companyId_siteId_idx" ON "UserSiteAccess"("companyId", "siteId");
ALTER TABLE "UserSiteAccess" ADD CONSTRAINT "UserSiteAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserSiteAccess" ADD CONSTRAINT "UserSiteAccess_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserSiteAccess" ADD CONSTRAINT "UserSiteAccess_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RetailStaffInvite" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "invitedById" TEXT,
    "tokenHash" TEXT NOT NULL,
    "sentTo" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailStaffInvite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RetailStaffInvite_tokenHash_key" ON "RetailStaffInvite"("tokenHash");
CREATE INDEX "RetailStaffInvite_companyId_userId_idx" ON "RetailStaffInvite"("companyId", "userId");
ALTER TABLE "RetailStaffInvite" ADD CONSTRAINT "RetailStaffInvite_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RetailStaffInvite" ADD CONSTRAINT "RetailStaffInvite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RetailStaffInvite" ADD CONSTRAINT "RetailStaffInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- "Last in" on People, and Activity's Who filter.
CREATE INDEX "PlatformAuditEvent_companyId_actor_createdAt_idx" ON "PlatformAuditEvent"("companyId", "actor", "createdAt");
