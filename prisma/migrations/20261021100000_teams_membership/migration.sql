-- Teams M2: a person's place in a workspace.
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED');

CREATE TABLE "WorkspaceMembership" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "role" "UserRole" NOT NULL,
    "suspendedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "removedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceMembership_companyId_userId_key" ON "WorkspaceMembership"("companyId", "userId");
CREATE INDEX "WorkspaceMembership_companyId_status_idx" ON "WorkspaceMembership"("companyId", "status");
CREATE INDEX "WorkspaceMembership_userId_status_idx" ON "WorkspaceMembership"("userId", "status");

-- One owner per workspace. Prisma cannot express the WHERE.
CREATE UNIQUE INDEX "WorkspaceMembership_one_owner" ON "WorkspaceMembership"("companyId") WHERE "isOwner";

ALTER TABLE "WorkspaceMembership" ADD CONSTRAINT "WorkspaceMembership_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceMembership" ADD CONSTRAINT "WorkspaceMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- backfill (idempotent: the witness test runs these statements again)
-- One membership per user. Active while the user is; removed when access was
-- taken away on a date; otherwise suspended.
INSERT INTO "WorkspaceMembership" ("id", "companyId", "userId", "status", "role", "suspendedAt", "removedAt", "removedById", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    u."companyId",
    u."id",
    (CASE WHEN u."isActive" THEN 'ACTIVE' WHEN u."accessRemovedAt" IS NOT NULL THEN 'REMOVED' ELSE 'SUSPENDED' END)::"MembershipStatus",
    u."role",
    CASE WHEN NOT u."isActive" AND u."accessRemovedAt" IS NULL THEN u."updatedAt" END,
    u."accessRemovedAt",
    u."accessRemovedById",
    u."createdAt",
    CURRENT_TIMESTAMP
FROM "User" u
ON CONFLICT ("companyId", "userId") DO NOTHING;

-- The earliest active manager or superadmin of a workspace owns it, unless it
-- already has an owner.
UPDATE "WorkspaceMembership" m
SET "isOwner" = true
FROM (
    SELECT DISTINCT ON ("companyId") "id"
    FROM "WorkspaceMembership"
    WHERE "status" = 'ACTIVE' AND "role" IN ('MANAGER', 'SUPERADMIN')
    ORDER BY "companyId", "createdAt", "id"
) earliest
WHERE m."id" = earliest."id"
  AND NOT EXISTS (SELECT 1 FROM "WorkspaceMembership" held WHERE held."companyId" = m."companyId" AND held."isOwner");

-- Every other superadmin is an admin.
UPDATE "WorkspaceMembership" SET "isAdmin" = true WHERE "role" = 'SUPERADMIN' AND NOT "isOwner" AND NOT "isAdmin";
-- report
-- A workspace with no active manager or superadmin gets no owner; the ownership
-- offer sets one. They are listed here so nobody finds out later.
DO $$
DECLARE
    ownerless text;
BEGIN
    SELECT string_agg(c."slug", ', ' ORDER BY c."slug") INTO ownerless
    FROM "Company" c
    WHERE NOT EXISTS (SELECT 1 FROM "WorkspaceMembership" m WHERE m."companyId" = c."id" AND m."isOwner");
    RAISE NOTICE 'teams_membership: workspaces with no owner: %', COALESCE(ownerless, 'none');
END $$;
