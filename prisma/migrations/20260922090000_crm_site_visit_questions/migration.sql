-- Site-visit questions that belong to the thing being quoted.
--
-- Until now a site visit carried DEFAULT_SITE_VISIT_CHECKLIST from
-- lib/crm/site-visits.ts: eight generic items, hardcoded, identical for every
-- tenant, with no relationship to what is being priced. A rep quoting epoxy
-- and a rep quoting branded mats were asked the same eight questions, and
-- neither was asked about substrate moisture or recess depth.
--
-- The question bank becomes data:
--
--   CrmQuestionSet   a named set of questions, optionally attached to a
--                    Product, so "what do we ask about epoxy" is a per-tenant
--                    answer rather than a constant in code.
--   CrmQuestion      one question, typed, ordered, archivable.
--
-- And the capture side:
--
--   CrmSiteVisitSection  one product being assessed within a visit. A rep at a
--                        warehouse quoting a floor AND an entrance mat is on
--                        one visit to one address; products are sections of it,
--                        not visits of their own.
--   CrmSiteVisitAnswer   one row per answer, not a JSON blob, for two reasons:
--                        photographs need a foreign key to attach to, and
--                        "which sites showed damp?" should be an indexed
--                        lookup rather than a scan of every visit ever done.
--                        The question's key, label and type are snapshotted
--                        onto the answer, so archiving a question leaves last
--                        year's report reading exactly as it did — the same
--                        property the old JSON checklist was chosen for.
--   CrmSiteVisitPhoto    always names the visit, optionally a section and an
--                        answer, because the bank asks for both: "site/area
--                        overview photographs" belong to no question, while
--                        "photograph cracks, joints, contamination" belongs to
--                        exactly one.
--
-- Offline capture is the reason for the three unique keys that look redundant:
-- a visit filled in on a phone with no signal is replayed when signal returns,
-- and each of them turns a replayed write into a no-op rather than a duplicate.

CREATE TYPE "CrmQuestionSetKind" AS ENUM ('PRODUCT', 'EVIDENCE', 'CLOSEOUT');

CREATE TYPE "CrmQuestionType" AS ENUM (
  'SHORT_TEXT', 'LONG_TEXT', 'NUMBER', 'BOOLEAN', 'SINGLE_SELECT',
  'MULTI_SELECT', 'DATE', 'DIMENSION', 'PHOTO_EVIDENCE'
);

-- Replaying a queued "start visit" must not book a second appointment.
ALTER TABLE "CrmAppointment" ADD COLUMN "clientVisitId" TEXT;
CREATE UNIQUE INDEX "CrmAppointment_companyId_clientVisitId_key"
  ON "CrmAppointment"("companyId", "clientVisitId");

CREATE TABLE "CrmQuestionSet" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CrmQuestionSetKind" NOT NULL DEFAULT 'PRODUCT',
    "productId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sourceTemplateKey" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmQuestionSet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CrmQuestionSet_companyId_key_key" ON "CrmQuestionSet"("companyId", "key");
CREATE INDEX "CrmQuestionSet_companyId_kind_isActive_idx" ON "CrmQuestionSet"("companyId", "kind", "isActive");
CREATE INDEX "CrmQuestionSet_companyId_productId_idx" ON "CrmQuestionSet"("companyId", "productId");

CREATE TABLE "CrmQuestion" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "questionSetId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "helpText" TEXT,
    "type" "CrmQuestionType" NOT NULL,
    "options" JSONB,
    "unit" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "requiresPhoto" BOOLEAN NOT NULL DEFAULT false,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmQuestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CrmQuestion_questionSetId_key_key" ON "CrmQuestion"("questionSetId", "key");
CREATE INDEX "CrmQuestion_companyId_questionSetId_position_idx" ON "CrmQuestion"("companyId", "questionSetId", "position");

CREATE TABLE "CrmSiteVisitSection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "productId" TEXT,
    "questionSetId" TEXT,
    "name" TEXT NOT NULL,
    "kind" "CrmQuestionSetKind" NOT NULL DEFAULT 'PRODUCT',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmSiteVisitSection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CrmSiteVisitSection_companyId_appointmentId_position_idx"
  ON "CrmSiteVisitSection"("companyId", "appointmentId", "position");

CREATE TABLE "CrmSiteVisitAnswer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "questionId" TEXT,
    "questionKey" TEXT NOT NULL,
    "questionLabel" TEXT NOT NULL,
    "questionType" "CrmQuestionType" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "valueText" TEXT,
    "valueNumber" DOUBLE PRECISION,
    "valueBool" BOOLEAN,
    "valueOptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "valueDate" TIMESTAMP(3),
    "valueJson" JSONB,
    "notes" TEXT,
    "notApplicable" BOOLEAN NOT NULL DEFAULT false,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredById" TEXT,
    CONSTRAINT "CrmSiteVisitAnswer_pkey" PRIMARY KEY ("id")
);

-- One answer per question per section. Also what makes a replayed offline
-- write an upsert rather than a second answer.
CREATE UNIQUE INDEX "CrmSiteVisitAnswer_sectionId_questionKey_key"
  ON "CrmSiteVisitAnswer"("sectionId", "questionKey");
-- The queries the bank exists to make possible: which sites showed damp, how
-- many epoxy jobs needed shot blasting.
CREATE INDEX "CrmSiteVisitAnswer_companyId_questionKey_valueBool_idx"
  ON "CrmSiteVisitAnswer"("companyId", "questionKey", "valueBool");
CREATE INDEX "CrmSiteVisitAnswer_companyId_questionKey_valueNumber_idx"
  ON "CrmSiteVisitAnswer"("companyId", "questionKey", "valueNumber");
CREATE INDEX "CrmSiteVisitAnswer_companyId_sectionId_position_idx"
  ON "CrmSiteVisitAnswer"("companyId", "sectionId", "position");

CREATE TABLE "CrmSiteVisitPhoto" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "sectionId" TEXT,
    "answerId" TEXT,
    "evidenceKey" TEXT,
    "blobPathname" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "caption" TEXT,
    "capturedAt" TIMESTAMP(3),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "clientPhotoId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrmSiteVisitPhoto_pkey" PRIMARY KEY ("id")
);

-- A retried upload attaches the same picture once, not twice.
CREATE UNIQUE INDEX "CrmSiteVisitPhoto_companyId_clientPhotoId_key"
  ON "CrmSiteVisitPhoto"("companyId", "clientPhotoId");
CREATE INDEX "CrmSiteVisitPhoto_companyId_appointmentId_createdAt_idx"
  ON "CrmSiteVisitPhoto"("companyId", "appointmentId", "createdAt");
CREATE INDEX "CrmSiteVisitPhoto_companyId_answerId_idx"
  ON "CrmSiteVisitPhoto"("companyId", "answerId");

ALTER TABLE "CrmQuestionSet"
  ADD CONSTRAINT "CrmQuestionSet_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CrmQuestionSet_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "CrmQuestionSet_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmQuestion"
  ADD CONSTRAINT "CrmQuestion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CrmQuestion_questionSetId_fkey" FOREIGN KEY ("questionSetId") REFERENCES "CrmQuestionSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CrmSiteVisitSection"
  ADD CONSTRAINT "CrmSiteVisitSection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CrmSiteVisitSection_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "CrmAppointment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CrmSiteVisitSection_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "CrmSiteVisitSection_questionSetId_fkey" FOREIGN KEY ("questionSetId") REFERENCES "CrmQuestionSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmSiteVisitAnswer"
  ADD CONSTRAINT "CrmSiteVisitAnswer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CrmSiteVisitAnswer_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "CrmSiteVisitSection"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CrmSiteVisitAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "CrmQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "CrmSiteVisitAnswer_answeredById_fkey" FOREIGN KEY ("answeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CrmSiteVisitPhoto"
  ADD CONSTRAINT "CrmSiteVisitPhoto_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CrmSiteVisitPhoto_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "CrmAppointment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CrmSiteVisitPhoto_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "CrmSiteVisitSection"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "CrmSiteVisitPhoto_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "CrmSiteVisitAnswer"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "CrmSiteVisitPhoto_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
