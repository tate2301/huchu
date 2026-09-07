-- A colour for every record, and the mark leads never had.
ALTER TABLE "CrmClient" ADD COLUMN "accent" TEXT;
ALTER TABLE "CrmPerson" ADD COLUMN "accent" TEXT;
ALTER TABLE "CrmSite" ADD COLUMN "accent" TEXT;
ALTER TABLE "CrmDeal" ADD COLUMN "accent" TEXT;

ALTER TABLE "CrmLead" ADD COLUMN "emoji" TEXT;
ALTER TABLE "CrmLead" ADD COLUMN "avatarUrl" TEXT;
ALTER TABLE "CrmLead" ADD COLUMN "accent" TEXT;
