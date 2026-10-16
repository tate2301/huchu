-- A workspace's verticals: what it pays for, one charge each.
CREATE TYPE "Vertical" AS ENUM ('GOLD', 'SCHOOLS', 'RETAIL', 'CRM', 'WORKSHOP', 'PAYROLL', 'GENERAL');

CREATE TABLE "CompanyVertical" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "vertical" "Vertical" NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyVertical_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyVertical_companyId_vertical_key" ON "CompanyVertical"("companyId", "vertical");

ALTER TABLE "CompanyVertical" ADD CONSTRAINT "CompanyVertical_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every workspace starts with the vertical it was set up as: a Flare workspace
-- is a CRM; a Corelith one is its profile's line of business.
INSERT INTO "CompanyVertical" ("id", "companyId", "vertical", "addedAt")
SELECT
    gen_random_uuid()::text,
    c."id",
    (CASE
        WHEN c."product" = 'FLARE' THEN 'CRM'
        WHEN c."workspaceProfile" = 'GOLD_MINE' THEN 'GOLD'
        WHEN c."workspaceProfile" = 'SCHOOLS' THEN 'SCHOOLS'
        WHEN c."workspaceProfile" = 'THRIFT' THEN 'RETAIL'
        WHEN c."workspaceProfile" = 'PAYROLL' THEN 'PAYROLL'
        WHEN c."workspaceProfile" = 'AUTOS' THEN 'WORKSHOP'
        ELSE 'GENERAL'
    END)::"Vertical",
    c."createdAt"
FROM "Company" c;
