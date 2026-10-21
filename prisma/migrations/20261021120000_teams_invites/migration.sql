-- Teams M4: invites, the shared invite link, ownership offers and the seat limit.
ALTER TABLE "Company" ADD COLUMN "seatLimit" INTEGER NOT NULL DEFAULT 5;

CREATE TYPE "InviteChannel" AS ENUM ('EMAIL', 'WHATSAPP');
CREATE TYPE "InviteStatus" AS ENUM ('SENT', 'NOT_DELIVERED', 'ACCEPTED', 'EXPIRED', 'REVOKED');
CREATE TYPE "OwnershipOfferStatus" AS ENUM ('OPEN', 'ACCEPTED', 'DECLINED', 'LAPSED');

CREATE TABLE "WorkspaceInvite" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "role" "UserRole" NOT NULL,
    "channel" "InviteChannel" NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'SENT',
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "landsOn" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedMembershipId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceInvite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InviteLink" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" TIMESTAMP(3),

    CONSTRAINT "InviteLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OwnershipOffer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fromMembershipId" TEXT NOT NULL,
    "toMembershipId" TEXT NOT NULL,
    "status" "OwnershipOfferStatus" NOT NULL DEFAULT 'OPEN',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnershipOffer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceInvite_tokenHash_key" ON "WorkspaceInvite"("tokenHash");
CREATE INDEX "WorkspaceInvite_companyId_status_idx" ON "WorkspaceInvite"("companyId", "status");
CREATE INDEX "WorkspaceInvite_companyId_email_idx" ON "WorkspaceInvite"("companyId", "email");
CREATE INDEX "WorkspaceInvite_companyId_phone_idx" ON "WorkspaceInvite"("companyId", "phone");
CREATE UNIQUE INDEX "InviteLink_tokenHash_key" ON "InviteLink"("tokenHash");
CREATE UNIQUE INDEX "InviteLink_companyId_role_key" ON "InviteLink"("companyId", "role");
CREATE INDEX "OwnershipOffer_companyId_status_idx" ON "OwnershipOffer"("companyId", "status");
-- One open offer per workspace. Prisma cannot express the WHERE.
CREATE UNIQUE INDEX "OwnershipOffer_one_open" ON "OwnershipOffer"("companyId") WHERE "status" = 'OPEN';

ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InviteLink" ADD CONSTRAINT "InviteLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OwnershipOffer" ADD CONSTRAINT "OwnershipOffer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OwnershipOffer" ADD CONSTRAINT "OwnershipOffer_fromMembershipId_fkey" FOREIGN KEY ("fromMembershipId") REFERENCES "WorkspaceMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OwnershipOffer" ADD CONSTRAINT "OwnershipOffer_toMembershipId_fkey" FOREIGN KEY ("toMembershipId") REFERENCES "WorkspaceMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

