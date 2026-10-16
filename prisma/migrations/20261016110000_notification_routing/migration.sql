-- Notifications (MgmtNotifications, NotifyHow): approved 15 Oct.
-- Who hears about what, per kind and channel, for the workspace and for each person;
-- when they go (quiet hours, Vane's morning message, repeats grouped); who did the thing;
-- and types for the kinds that until now carried their record as payload.subject.

-- Books, leave, reports and Vane get types of their own.
ALTER TYPE "NotificationType" ADD VALUE 'BOOKS_INVOICE_PAID';
ALTER TYPE "NotificationType" ADD VALUE 'BOOKS_PAYMENT_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'HR_LEAVE_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'HR_LEAVE_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE 'HR_LEAVE_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'REPORT_SENT';
ALTER TYPE "NotificationType" ADD VALUE 'VANE_ISSUE_RAISED';
ALTER TYPE "NotificationEntityType" ADD VALUE 'INVOICE';
ALTER TYPE "NotificationEntityType" ADD VALUE 'PAYMENT';
ALTER TYPE "NotificationEntityType" ADD VALUE 'LEAVE_REQUEST';
ALTER TYPE "NotificationEntityType" ADD VALUE 'REPORT';
ALTER TYPE "NotificationEntityType" ADD VALUE 'VANE_ITEM';

-- Who did it: the quiet row's initials, and "anything you did yourself never notifies you".
ALTER TABLE "Notification" ADD COLUMN "actorId" TEXT;
CREATE INDEX "Notification_actorId_idx" ON "Notification"("actorId");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'WHATSAPP', 'PHONE');

-- A kind on a channel, on or off: the workspace's rule (userId null) or one person's own.
CREATE TABLE "NotificationSetting" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "kind" VARCHAR(32) NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationSetting_pkey" PRIMARY KEY ("id")
);
-- NULLS NOT DISTINCT: one workspace rule per kind and channel, not one per insert.
CREATE UNIQUE INDEX "NotificationSetting_companyId_userId_kind_channel_key" ON "NotificationSetting"("companyId", "userId", "kind", "channel") NULLS NOT DISTINCT;
CREATE INDEX "NotificationSetting_userId_idx" ON "NotificationSetting"("userId");
ALTER TABLE "NotificationSetting" ADD CONSTRAINT "NotificationSetting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationSetting" ADD CONSTRAINT "NotificationSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- When: quiet hours for the phone and WhatsApp, Vane's morning message, repeats grouped.
CREATE TABLE "NotificationPolicy" (
    "companyId" TEXT NOT NULL,
    "quietFrom" VARCHAR(5) NOT NULL DEFAULT '20:00',
    "quietTo" VARCHAR(5) NOT NULL DEFAULT '06:00',
    "morningMessage" BOOLEAN NOT NULL DEFAULT false,
    "groupRepeats" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationPolicy_pkey" PRIMARY KEY ("companyId")
);
ALTER TABLE "NotificationPolicy" ADD CONSTRAINT "NotificationPolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Vane's reader reaches the new tables and column, as `pnpm vane:reader-sql` prints them.
GRANT SELECT ("actorId") ON "Notification" TO vane_reader;
ALTER TABLE "NotificationSetting" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "NotificationSetting" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "NotificationSetting" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "userId", "kind", "channel", "enabled", "updatedById", "createdAt", "updatedAt") ON "NotificationSetting" TO vane_reader;
ALTER TABLE "NotificationPolicy" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "NotificationPolicy" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "NotificationPolicy" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("companyId", "quietFrom", "quietTo", "morningMessage", "groupRepeats", "updatedById", "updatedAt") ON "NotificationPolicy" TO vane_reader;

-- Explore's reader reaches them too, as `pnpm explore:reader-sql` prints them (20261016100000_explore_reader, approved with this).
GRANT SELECT ("actorId") ON "Notification" TO explore_reader;
CREATE POLICY "explore_workspace" ON "NotificationSetting" AS RESTRICTIVE FOR SELECT TO explore_reader USING ('NotificationSetting' = ANY (COALESCE((SELECT s."tables" FROM "ExploreReaderScope" s WHERE s."pid" = pg_backend_pid()), ARRAY[]::text[])) AND "companyId" = (SELECT s."companyId" FROM "ExploreReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "userId", "kind", "channel", "enabled", "updatedById", "createdAt", "updatedAt") ON "NotificationSetting" TO explore_reader;
CREATE POLICY "explore_workspace" ON "NotificationPolicy" AS RESTRICTIVE FOR SELECT TO explore_reader USING ('NotificationPolicy' = ANY (COALESCE((SELECT s."tables" FROM "ExploreReaderScope" s WHERE s."pid" = pg_backend_pid()), ARRAY[]::text[])) AND "companyId" = (SELECT s."companyId" FROM "ExploreReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("companyId", "quietFrom", "quietTo", "morningMessage", "groupRepeats", "updatedById", "updatedAt") ON "NotificationPolicy" TO explore_reader;
