-- Teams M7: where an event came from and which module wrote it, on the two
-- tables that hold what people write on a record. Files and field changes have
-- no such column; the timeline reader derives them (lib/teams/timeline.ts).
CREATE TYPE "EventSource" AS ENUM ('TILL', 'PHONE', 'WEB', 'WHATSAPP', 'IMPORT', 'ZIMRA', 'BANK', 'SYSTEM');
CREATE TYPE "EventModule" AS ENUM ('CRM', 'RETAIL', 'BOOKS', 'PEOPLE', 'PAYROLL', 'OPERATIONS', 'SCHOOLS', 'REPORTS', 'VANE', 'GOLD', 'TEAMS');

ALTER TABLE "CrmActivity" ADD COLUMN "source" "EventSource" NOT NULL DEFAULT 'WEB', ADD COLUMN "module" "EventModule" NOT NULL DEFAULT 'CRM';
ALTER TABLE "CrmComment" ADD COLUMN "source" "EventSource" NOT NULL DEFAULT 'WEB', ADD COLUMN "module" "EventModule" NOT NULL DEFAULT 'CRM';

-- Every existing row was written on the CRM. What was only ever the system or
-- a WhatsApp message says so; a person's call or note was logged on the web.
UPDATE "CrmActivity"
SET "source" = (CASE "type"::text
    WHEN 'WHATSAPP' THEN 'WHATSAPP'
    WHEN 'SYSTEM' THEN 'SYSTEM'
    WHEN 'INTAKE_SUBMISSION' THEN 'SYSTEM'
    ELSE 'WEB'
  END)::"EventSource";

-- Vane's and Explore's readers read the new columns where they read the others.
GRANT SELECT ("source", "module") ON "CrmActivity" TO vane_reader;
GRANT SELECT ("source", "module") ON "CrmActivity" TO explore_reader;
GRANT SELECT ("source", "module") ON "CrmComment" TO vane_reader;
GRANT SELECT ("source", "module") ON "CrmComment" TO explore_reader;
