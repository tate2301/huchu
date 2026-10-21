-- Teams M5: a "needs you" notification waits for its reader to act, however
-- often it is read. `Notification.needsAction` says which ones; it is set when
-- the notification is written (`lib/notifications.ts`).
ALTER TABLE "Notification" ADD COLUMN "needsAction" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Notification_companyId_needsAction_idx" ON "Notification"("companyId", "needsAction");

-- The types that ask the reader for something (`NEEDS_YOU_TYPES` in
-- lib/inbox/describe.ts, which includes mentions), anything critical, and
-- anything that said so in its payload, unless its payload said it did not.
UPDATE "Notification"
SET "needsAction" = true
WHERE (
    "type"::text IN ('HR_PAYROLL_SUBMITTED', 'HR_DISBURSEMENT_SUBMITTED', 'HR_ADJUSTMENT_SUBMITTED', 'HR_COMP_PROFILE_SUBMITTED', 'HR_COMP_RULE_SUBMITTED', 'HR_GOLD_PAYOUT_SUBMITTED', 'HR_DISCIPLINARY_SUBMITTED', 'HR_LEAVE_SUBMITTED', 'VANE_ISSUE_RAISED', 'OPS_PERMIT_EXPIRING', 'OPS_PERMIT_EXPIRED', 'CRM_LEAD_ASSIGNED', 'CRM_TASK_ASSIGNED', 'CRM_TASK_DUE', 'CRM_FOLLOW_UP_DUE', 'CRM_MENTIONED', 'CRM_REQUISITION_SUBMITTED', 'CRM_REQUISITION_QUESTION', 'RETAIL_COUNT_ASSIGNED', 'RETAIL_COUNT_SUBMITTED', 'RETAIL_PRICE_APPROVAL', 'RETAIL_PIN_LOCKED', 'RETAIL_SUPPORT', 'RETAIL_SHIFT_DIFFERENCE', 'RETAIL_ORDER_FOLLOW_UP', 'RETAIL_DELIVERY_TO_CHECK')
    OR "severity"::text = 'CRITICAL'
    OR "payloadJson" LIKE '%"needsYou":true%'
  )
  AND NOT COALESCE("payloadJson" LIKE '%"needsYou":false%', false);

-- What a seat request, an ownership offer, a handed-over job and a request to
-- see a record say to the person who must act.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TEAMS_SEAT_REQUEST';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TEAMS_OWNERSHIP_OFFER';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TEAMS_RECORD_HANDED_OVER';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TEAMS_ACCESS_REQUEST';

-- Vane's and Explore's readers read the new column where they read the others.
GRANT SELECT ("needsAction") ON "Notification" TO vane_reader;
GRANT SELECT ("needsAction") ON "Notification" TO explore_reader;
