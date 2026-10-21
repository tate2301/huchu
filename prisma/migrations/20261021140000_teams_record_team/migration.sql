-- Teams M6: a team on a record, and who may see it.
-- The record-type enum loses its CRM-only name and gains Tender's customers,
-- products and suppliers, so each can have a team, comments and files.
ALTER TYPE "CrmFieldEntity" RENAME TO "RecordSubjectType";
ALTER TYPE "RecordSubjectType" ADD VALUE IF NOT EXISTS 'RETAIL_CUSTOMER';
ALTER TYPE "RecordSubjectType" ADD VALUE IF NOT EXISTS 'RETAIL_PRODUCT';
ALTER TYPE "RecordSubjectType" ADD VALUE IF NOT EXISTS 'RETAIL_SUPPLIER';

CREATE TYPE "RecordAccessStatus" AS ENUM ('ACTIVE', 'REQUESTED', 'DENIED');

CREATE TABLE "RecordTeamMember" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "subjectType" "RecordSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "followsOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordTeamMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecordAccessGrant" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "subjectType" "RecordSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "status" "RecordAccessStatus" NOT NULL DEFAULT 'REQUESTED',
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordAccessGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecordTeamMember_companyId_subjectType_subjectId_membership_key" ON "RecordTeamMember"("companyId", "subjectType", "subjectId", "membershipId");
CREATE INDEX "RecordTeamMember_companyId_subjectType_subjectId_idx" ON "RecordTeamMember"("companyId", "subjectType", "subjectId");
CREATE INDEX "RecordTeamMember_membershipId_idx" ON "RecordTeamMember"("membershipId");
-- One owner per record. Prisma cannot express the WHERE.
CREATE UNIQUE INDEX "RecordTeamMember_one_owner" ON "RecordTeamMember"("companyId", "subjectType", "subjectId") WHERE "isOwner";
CREATE UNIQUE INDEX "RecordAccessGrant_companyId_subjectType_subjectId_membershi_key" ON "RecordAccessGrant"("companyId", "subjectType", "subjectId", "membershipId");
CREATE INDEX "RecordAccessGrant_companyId_subjectType_subjectId_idx" ON "RecordAccessGrant"("companyId", "subjectType", "subjectId");

ALTER TABLE "RecordTeamMember" ADD CONSTRAINT "RecordTeamMember_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordTeamMember" ADD CONSTRAINT "RecordTeamMember_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "WorkspaceMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordAccessGrant" ADD CONSTRAINT "RecordAccessGrant_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordAccessGrant" ADD CONSTRAINT "RecordAccessGrant_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "WorkspaceMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Followers are on the team, following only. Anyone who follows has a
-- membership (M2 made one for every user; this only covers a user created in between).
INSERT INTO "WorkspaceMembership" ("id", "companyId", "userId", "status", "role", "isAdmin", "suspendedAt", "removedAt", "removedById", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text, u."companyId", u."id",
    (CASE WHEN u."isActive" THEN 'ACTIVE' WHEN u."accessRemovedAt" IS NOT NULL THEN 'REMOVED' ELSE 'SUSPENDED' END)::"MembershipStatus",
    u."role", u."role" = 'SUPERADMIN',
    CASE WHEN NOT u."isActive" AND u."accessRemovedAt" IS NULL THEN u."updatedAt" END,
    u."accessRemovedAt", u."accessRemovedById", u."createdAt", CURRENT_TIMESTAMP
FROM "User" u
WHERE u."id" IN (SELECT "userId" FROM "CrmFollower")
ON CONFLICT ("companyId", "userId") DO NOTHING;

INSERT INTO "RecordTeamMember" ("id", "companyId", "subjectType", "subjectId", "membershipId", "isOwner", "followsOnly", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, f."companyId", f."entity", f."recordId", m."id", false, true, f."createdAt", CURRENT_TIMESTAMP
FROM "CrmFollower" f
JOIN "WorkspaceMembership" m ON m."userId" = f."userId" AND m."companyId" = f."companyId"
ON CONFLICT ("companyId", "subjectType", "subjectId", "membershipId") DO NOTHING;

DROP TABLE "CrmFollower";
