-- Notifications are emailed as well as shown in the app, and a record's
-- members hear about new activity on it. Additive: everyone starts with email
-- on, as nobody has a row saying otherwise.
ALTER TABLE "UserNotificationPreference" ADD COLUMN "emailEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TYPE "NotificationType" ADD VALUE 'CRM_RECORD_ACTIVITY';

ALTER TYPE "NotificationEntityType" ADD VALUE 'CRM_RECORD';
