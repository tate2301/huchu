-- Notification types for the requisition round trip and the daily report.
--
-- Three values rather than reusing CRM_FOLLOW_UP_DUE: the type is what the
-- notification centre groups and filters on, and a requisition filed under
-- "follow-up due" is a notice nobody can find again.
--
-- CRM_REQUISITION_DECIDED covers approval and rejection with one value. From
-- the requester's side they are the same event -- "somebody answered" -- and
-- the answer is in the notice itself. Two types would mean two filters for
-- one question.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CRM_REQUISITION_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CRM_REQUISITION_DECIDED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CRM_DAILY_REPORT_READY';

-- What the notice is about. Pointing a requisition at CRM_LEAD would make the
-- notification centre's "open the record" action open the wrong thing, or
-- nothing at all.
ALTER TYPE "NotificationEntityType" ADD VALUE IF NOT EXISTS 'CRM_REQUISITION';
ALTER TYPE "NotificationEntityType" ADD VALUE IF NOT EXISTS 'CRM_PROJECT';
ALTER TYPE "NotificationEntityType" ADD VALUE IF NOT EXISTS 'CRM_DAILY_REPORT';
