-- Overview pages people can arrange, and widgets they can build.
CREATE TABLE "CrmOverviewLayout" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "scope" TEXT NOT NULL,
    "widgets" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmOverviewLayout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CrmOverviewLayout_companyId_userId_scope_key"
    ON "CrmOverviewLayout"("companyId", "userId", "scope");
CREATE INDEX "CrmOverviewLayout_companyId_scope_idx"
    ON "CrmOverviewLayout"("companyId", "scope");

ALTER TABLE "CrmOverviewLayout" ADD CONSTRAINT "CrmOverviewLayout_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmOverviewLayout" ADD CONSTRAINT "CrmOverviewLayout_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CrmCustomWidget" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "entity" TEXT NOT NULL,
    "aggregate" TEXT NOT NULL,
    "valueField" TEXT,
    "groupField" TEXT,
    "filters" JSONB NOT NULL,
    "display" TEXT NOT NULL DEFAULT 'NUMBER',
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmCustomWidget_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CrmCustomWidget_companyId_entity_idx" ON "CrmCustomWidget"("companyId", "entity");
CREATE INDEX "CrmCustomWidget_companyId_createdById_idx" ON "CrmCustomWidget"("companyId", "createdById");

ALTER TABLE "CrmCustomWidget" ADD CONSTRAINT "CrmCustomWidget_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmCustomWidget" ADD CONSTRAINT "CrmCustomWidget_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
