-- Health, allergy and consent records.
--
-- Sold under "Boarding and welfare" and entirely absent from the schema. A
-- boarding school that cannot answer "is she allergic to anything" from the
-- system answers it from a folder in an office that is locked at night.

CREATE TYPE "SchoolHealthEventKind" AS ENUM (
    'SANATORIUM_VISIT', 'MEDICATION', 'INJURY', 'REFERRAL', 'SCREENING'
);

CREATE TABLE "SchoolHealthRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "bloodGroup" TEXT,
    "allergies" TEXT,
    "chronicConditions" TEXT,
    "medications" TEXT,
    "dietaryRequirements" TEXT,
    "doctorName" TEXT,
    "doctorPhone" TEXT,
    "medicalAidProvider" TEXT,
    "medicalAidNumber" TEXT,
    "consentFirstAid" BOOLEAN NOT NULL DEFAULT false,
    "consentEmergencyTreatment" BOOLEAN NOT NULL DEFAULT false,
    "consentPhotography" BOOLEAN NOT NULL DEFAULT false,
    "consentOutings" BOOLEAN NOT NULL DEFAULT false,
    "consentGivenBy" TEXT,
    "consentGivenAt" TIMESTAMP(3),
    "notes" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolHealthRecord_pkey" PRIMARY KEY ("id")
);

-- One record per child. A second would mean a nurse at two in the morning
-- reading whichever came back first, and the allergy might be on the other one.
CREATE UNIQUE INDEX "SchoolHealthRecord_studentId_key"
    ON "SchoolHealthRecord" ("studentId");
CREATE INDEX "SchoolHealthRecord_companyId_idx" ON "SchoolHealthRecord" ("companyId");

-- Consent without a giver is consent nobody can stand behind, and a date with
-- nobody's name against it is the same. Either both or neither.
ALTER TABLE "SchoolHealthRecord"
    ADD CONSTRAINT "SchoolHealthRecord_consent_provenance_check"
    CHECK (("consentGivenBy" IS NULL) = ("consentGivenAt" IS NULL));

-- A consent given by nobody is not a consent. If any of the four is on, the
-- record has to say who said so.
ALTER TABLE "SchoolHealthRecord"
    ADD CONSTRAINT "SchoolHealthRecord_consent_needs_giver_check"
    CHECK (
        NOT ("consentFirstAid" OR "consentEmergencyTreatment"
             OR "consentPhotography" OR "consentOutings")
        OR "consentGivenBy" IS NOT NULL
    );

CREATE TABLE "SchoolHealthEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "healthRecordId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "kind" "SchoolHealthEventKind" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" TEXT NOT NULL,
    "treatment" TEXT,
    "guardianNotified" BOOLEAN NOT NULL DEFAULT false,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolHealthEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SchoolHealthEvent_companyId_studentId_occurredAt_idx"
    ON "SchoolHealthEvent" ("companyId", "studentId", "occurredAt");
CREATE INDEX "SchoolHealthEvent_companyId_occurredAt_idx"
    ON "SchoolHealthEvent" ("companyId", "occurredAt");

ALTER TABLE "SchoolHealthRecord" ADD CONSTRAINT "SchoolHealthRecord_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolHealthRecord" ADD CONSTRAINT "SchoolHealthRecord_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SchoolHealthEvent" ADD CONSTRAINT "SchoolHealthEvent_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolHealthEvent" ADD CONSTRAINT "SchoolHealthEvent_healthRecordId_fkey"
    FOREIGN KEY ("healthRecordId") REFERENCES "SchoolHealthRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolHealthEvent" ADD CONSTRAINT "SchoolHealthEvent_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "SchoolStudent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
