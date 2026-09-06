-- Portal identity by account, not by string.
--
-- The student portal resolved the signed-in student by upper-casing the local
-- part of their email and matching it against studentNo; the parent portal
-- matched the session email against SchoolGuardian.email, a column that is
-- nullable and not unique. Both are replaced by a real foreign key.
--
-- Nullable because an account is only linked once the invite is claimed. The
-- unique index is per company and Postgres treats NULLs as distinct, so any
-- number of unclaimed rows coexist while a claimed account maps to exactly one
-- student and one guardian within a school.

ALTER TABLE "SchoolStudent" ADD COLUMN "userId" TEXT;
ALTER TABLE "SchoolGuardian" ADD COLUMN "userId" TEXT;

ALTER TABLE "SchoolStudent"
    ADD CONSTRAINT "SchoolStudent_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SchoolGuardian"
    ADD CONSTRAINT "SchoolGuardian_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "SchoolStudent_companyId_userId_key"
    ON "SchoolStudent" ("companyId", "userId");

CREATE UNIQUE INDEX "SchoolGuardian_companyId_userId_key"
    ON "SchoolGuardian" ("companyId", "userId");
