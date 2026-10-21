-- Teams M3: a permission override belongs to the person in a workspace, so one
-- person can differ per workspace. `userId` goes in this migration, with its
-- index and key; every reader and writer now uses `membershipId`.
ALTER TABLE "UserPermissionOverride" ADD COLUMN "membershipId" TEXT;

-- Anyone holding an override has a membership (M2 made one for every user; this
-- only covers a user created in between).
INSERT INTO "WorkspaceMembership" ("id", "companyId", "userId", "status", "role", "isAdmin", "suspendedAt", "removedAt", "removedById", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text, u."companyId", u."id",
    (CASE WHEN u."isActive" THEN 'ACTIVE' WHEN u."accessRemovedAt" IS NOT NULL THEN 'REMOVED' ELSE 'SUSPENDED' END)::"MembershipStatus",
    u."role", u."role" = 'SUPERADMIN',
    CASE WHEN NOT u."isActive" AND u."accessRemovedAt" IS NULL THEN u."updatedAt" END,
    u."accessRemovedAt", u."accessRemovedById", u."createdAt", CURRENT_TIMESTAMP
FROM "User" u
WHERE u."id" IN (SELECT "userId" FROM "UserPermissionOverride")
ON CONFLICT ("companyId", "userId") DO NOTHING;

UPDATE "UserPermissionOverride" o
SET "membershipId" = m."id"
FROM "WorkspaceMembership" m
WHERE m."userId" = o."userId" AND m."companyId" = o."companyId";

-- An override recorded against a workspace its user is not in never applied.
DELETE FROM "UserPermissionOverride" WHERE "membershipId" IS NULL;

ALTER TABLE "UserPermissionOverride" ALTER COLUMN "membershipId" SET NOT NULL;

DROP INDEX IF EXISTS "UserPermissionOverride_userId_permissionKey_key";
DROP INDEX IF EXISTS "UserPermissionOverride_userId_idx";
ALTER TABLE "UserPermissionOverride" DROP CONSTRAINT IF EXISTS "UserPermissionOverride_userId_fkey";
ALTER TABLE "UserPermissionOverride" DROP COLUMN "userId";

CREATE UNIQUE INDEX "UserPermissionOverride_membershipId_permissionKey_key" ON "UserPermissionOverride"("membershipId", "permissionKey");
CREATE INDEX "UserPermissionOverride_membershipId_idx" ON "UserPermissionOverride"("membershipId");
ALTER TABLE "UserPermissionOverride" ADD CONSTRAINT "UserPermissionOverride_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "WorkspaceMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The readers of Vane and Explore read the new column where they read the old.
GRANT SELECT ("membershipId") ON "UserPermissionOverride" TO vane_reader;
GRANT SELECT ("membershipId") ON "UserPermissionOverride" TO explore_reader;
