-- Self-serve signup: a stranger becomes a workspace without an operator.
--
--   Company.product   the trading name a workspace was sold under. Every
--                     existing tenant was provisioned by an operator under the
--                     Corelith name, so CORELITH is the default and the only
--                     value existing rows take. FLARE is the CRM sold on its
--                     own. Decides brand, home route and offered integrations.
--
--   SignupRequest     name and email waiting for a workspace. There is no user
--                     until the company exists, because a user belongs to one.
--                     `companyId` is set when provisioning succeeds, so a
--                     retried submit returns the same workspace.
--
--   EmailCode         a six-digit code, stored as a keyed hash, never in the
--                     clear. SIGNUP proves an address; SIGN_IN replaces the
--                     password for people who never set one.
--
--   SessionHandoff    a one-use ticket from the signup host to the workspace
--                     host. Sessions are per host; this is how the new admin
--                     arrives in their workspace already signed in.
--
-- Additive only: one column with a default, three tables, two enums.

CREATE TYPE "WorkspaceProduct" AS ENUM ('CORELITH', 'FLARE');

CREATE TYPE "EmailCodePurpose" AS ENUM ('SIGNUP', 'SIGN_IN');

ALTER TABLE "Company" ADD COLUMN "product" "WorkspaceProduct" NOT NULL DEFAULT 'CORELITH';

CREATE TABLE "SignupRequest" (
    "id" TEXT NOT NULL,
    "product" "WorkspaceProduct" NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "attribution" JSONB,
    "verifiedAt" TIMESTAMP(3),
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignupRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SignupRequest_email_idx" ON "SignupRequest"("email");

CREATE INDEX "SignupRequest_companyId_idx" ON "SignupRequest"("companyId");

ALTER TABLE "SignupRequest" ADD CONSTRAINT "SignupRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "EmailCode" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "purpose" "EmailCodePurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailCode_email_purpose_createdAt_idx" ON "EmailCode"("email", "purpose", "createdAt");

CREATE TABLE "SessionHandoff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionHandoff_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SessionHandoff_tokenHash_key" ON "SessionHandoff"("tokenHash");

CREATE INDEX "SessionHandoff_userId_idx" ON "SessionHandoff"("userId");

ALTER TABLE "SessionHandoff" ADD CONSTRAINT "SessionHandoff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
