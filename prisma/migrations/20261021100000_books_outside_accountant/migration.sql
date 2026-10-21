-- Books: the outside accountant (design/books NOTES §5.1, approved 21 Oct).
-- A member is staff or an outside accountant: from the firm that audits or keeps the books, with an
-- access end date. In Books they have the owner's rights until that date, every act marked as theirs.
-- The per-person "may void and revise" grant (books.void) goes: no one keeps void or revise by override.

-- CreateEnum
CREATE TYPE "MemberKind" AS ENUM ('STAFF', 'OUTSIDE_ACCOUNTANT');

-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "memberKind" "MemberKind" NOT NULL DEFAULT 'STAFF',
  ADD COLUMN "firmName" TEXT,
  ADD COLUMN "accessEndsOn" DATE;

-- An outside accountant always has a firm and an end date.
ALTER TABLE "User" ADD CONSTRAINT "User_outside_accountant_check"
  CHECK ("memberKind" = 'STAFF' OR ("firmName" IS NOT NULL AND "accessEndsOn" IS NOT NULL));

-- The per-person grant goes.
DELETE FROM "UserPermissionOverride" WHERE "permissionKey" = 'books.void';

-- Vane's and Explore's readers read the new columns, as `pnpm vane:reader-sql` and `pnpm explore:reader-sql` print them.
GRANT SELECT ("id", "email", "name", "role", "companyId", "isActive", "allSites", "accessRemovedAt", "accessRemovedById", "emailVerified", "image", "sessionsEndedAt", "memberKind", "firmName", "accessEndsOn", "createdAt", "updatedAt") ON "User" TO vane_reader;
GRANT SELECT ("id", "email", "name", "role", "companyId", "isActive", "allSites", "accessRemovedAt", "accessRemovedById", "emailVerified", "image", "sessionsEndedAt", "memberKind", "firmName", "accessEndsOn", "createdAt", "updatedAt") ON "User" TO explore_reader;
