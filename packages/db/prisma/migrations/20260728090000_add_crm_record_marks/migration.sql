-- A record can carry its own mark: an uploaded picture, or an emoji standing
-- in for one. Both are optional; without either, the UI falls back to the
-- entity's icon (or, for people, their initials).
ALTER TABLE "CrmClient" ADD COLUMN "avatarUrl" TEXT, ADD COLUMN "emoji" TEXT;
ALTER TABLE "CrmPerson" ADD COLUMN "avatarUrl" TEXT, ADD COLUMN "emoji" TEXT;
ALTER TABLE "CrmSite"   ADD COLUMN "avatarUrl" TEXT, ADD COLUMN "emoji" TEXT;
ALTER TABLE "CrmDeal"   ADD COLUMN "avatarUrl" TEXT, ADD COLUMN "emoji" TEXT;
