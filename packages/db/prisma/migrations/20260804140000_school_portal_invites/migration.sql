-- Invitations for students and guardians to claim a portal account.
--
-- The subject is a nullable foreign key per kind rather than a type+id string,
-- so a deleted student takes their invites with them and an invite can never
-- point at a record that does not exist.
--
-- Only the sha256 hash of the token is stored, matching lib/crm/api-keys.ts.
-- The plaintext is returned once to whoever issued the invite and is not
-- recoverable afterwards.

CREATE TYPE "SchoolPortalInviteSubject" AS ENUM ('STUDENT', 'GUARDIAN');

CREATE TABLE "SchoolPortalInvite" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "subject" "SchoolPortalInviteSubject" NOT NULL,
    "studentId" TEXT,
    "guardianId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "sentTo" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "claimedUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolPortalInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SchoolPortalInvite_tokenHash_key" ON "SchoolPortalInvite"("tokenHash");
CREATE INDEX "SchoolPortalInvite_companyId_subject_claimedAt_idx" ON "SchoolPortalInvite"("companyId", "subject", "claimedAt");
CREATE INDEX "SchoolPortalInvite_studentId_idx" ON "SchoolPortalInvite"("studentId");
CREATE INDEX "SchoolPortalInvite_guardianId_idx" ON "SchoolPortalInvite"("guardianId");

-- Exactly one subject, matching the `subject` discriminator. Without this a row
-- could name a student and claim to be a guardian invite.
ALTER TABLE "SchoolPortalInvite"
    ADD CONSTRAINT "SchoolPortalInvite_subject_matches_fk" CHECK (
        ("subject" = 'STUDENT'  AND "studentId" IS NOT NULL AND "guardianId" IS NULL) OR
        ("subject" = 'GUARDIAN' AND "guardianId" IS NOT NULL AND "studentId" IS NULL)
    );

ALTER TABLE "SchoolPortalInvite" ADD CONSTRAINT "SchoolPortalInvite_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolPortalInvite" ADD CONSTRAINT "SchoolPortalInvite_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolPortalInvite" ADD CONSTRAINT "SchoolPortalInvite_guardianId_fkey"
    FOREIGN KEY ("guardianId") REFERENCES "SchoolGuardian"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolPortalInvite" ADD CONSTRAINT "SchoolPortalInvite_claimedUserId_fkey"
    FOREIGN KEY ("claimedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
