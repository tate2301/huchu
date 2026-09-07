-- A visit can be somewhere that is not a recorded site, and can be shared
-- with somebody who has no account.
ALTER TABLE "CrmAppointment" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "CrmAppointment" ADD COLUMN "longitude" DOUBLE PRECISION;
ALTER TABLE "CrmAppointment" ADD COLUMN "briefToken" TEXT;
ALTER TABLE "CrmAppointment" ADD COLUMN "briefSharedAt" TIMESTAMP(3);
ALTER TABLE "CrmAppointment" ADD COLUMN "briefExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "CrmAppointment_briefToken_key" ON "CrmAppointment"("briefToken");
