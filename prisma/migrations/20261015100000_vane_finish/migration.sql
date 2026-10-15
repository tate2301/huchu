-- What finishes Vane's boards: a work order Vane drafts from breakdowns (PageVaneMine), which
-- needs the work order's own workspace, maker, priority and Vane's mark; and a sales rep's
-- reading narrowed to their own visits and quotes (PageVanePhone).

-- AlterEnum
ALTER TYPE "WorkOrderStatus" ADD VALUE 'DRAFT' BEFORE 'OPEN';

-- CreateEnum
CREATE TYPE "WorkOrderPriority" AS ENUM ('NORMAL', 'HIGH', 'URGENT');

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "madeByVane" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "priority" "WorkOrderPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "vaneNote" TEXT;

-- Backfill: a work order's workspace is its equipment's site's.
UPDATE "WorkOrder" w SET "companyId" = s."companyId" FROM "Equipment" e JOIN "Site" s ON s."id" = e."siteId" WHERE e."id" = w."equipmentId";

ALTER TABLE "WorkOrder" ALTER COLUMN "companyId" SET NOT NULL;

-- AlterTable
ALTER TABLE "VaneReaderScope" ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE INDEX "WorkOrder_companyId_status_idx" ON "WorkOrder"("companyId", "status");

-- CreateIndex
CREATE INDEX "WorkOrder_createdById_idx" ON "WorkOrder"("createdById");

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Vane's reader: a work order is now scoped by its own workspace (it was scoped through its
-- technician, so one with nobody assigned was unreadable), and reaches the new columns.
DROP POLICY IF EXISTS "vane_workspace" ON "WorkOrder";
CREATE POLICY "vane_workspace" ON "WorkOrder" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("companyId", "createdById", "madeByVane", "priority", "vaneNote") ON "WorkOrder" TO vane_reader;
GRANT SELECT ("userId") ON "VaneReaderScope" TO vane_reader;

-- A sales rep's reading: vane_reader switches to this role (SET LOCAL ROLE) when the person asking is a rep.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vane_reader_rep') THEN CREATE ROLE vane_reader_rep NOLOGIN; END IF;
END $$;
GRANT vane_reader_rep TO vane_reader;
GRANT USAGE ON SCHEMA public TO vane_reader_rep;
CREATE POLICY "vane_rep_own_pid" ON "VaneReaderScope" AS RESTRICTIVE FOR SELECT TO vane_reader_rep USING ("pid" = pg_backend_pid());
GRANT SELECT ("pid", "companyId", "userId") ON "VaneReaderScope" TO vane_reader_rep;
CREATE POLICY "vane_rep" ON "CrmAppointment" AS RESTRICTIVE FOR SELECT TO vane_reader_rep USING (("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid())) AND ((SELECT s."userId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()) IS NULL OR "CrmAppointment"."assignedToId" = (SELECT s."userId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid())));
GRANT SELECT ("id", "companyId", "appointmentNo", "title", "leadId", "clientId", "dealId", "siteId", "assignedToId", "scheduledStart", "scheduledEnd", "location", "status", "outcomeNotes", "completedAt", "createdById", "createdAt", "updatedAt", "checklist", "siteConditions", "reportNotes", "reportCompletedAt", "latitude", "longitude", "briefSharedAt", "briefExpiresAt", "clientVisitId") ON "CrmAppointment" TO vane_reader_rep;
CREATE POLICY "vane_rep" ON "CrmDeal" AS RESTRICTIVE FOR SELECT TO vane_reader_rep USING (("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid())) AND ((SELECT s."userId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()) IS NULL OR "CrmDeal"."assignedToId" = (SELECT s."userId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid())));
GRANT SELECT ("id", "avatarUrl", "accent", "emoji", "companyId", "dealNo", "title", "clientId", "primaryContactId", "siteId", "pipelineId", "stageId", "status", "value", "currency", "probability", "forecastCategory", "expectedCloseDate", "assignedToId", "services", "source", "sourceChannel", "lostReason", "customFields", "stageEnteredAt", "wonAt", "lostAt", "convertedFromLeadId", "archivedAt", "createdById", "createdAt", "updatedAt") ON "CrmDeal" TO vane_reader_rep;
CREATE POLICY "vane_rep" ON "CrmLead" AS RESTRICTIVE FOR SELECT TO vane_reader_rep USING (("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid())) AND ((SELECT s."userId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()) IS NULL OR "CrmLead"."assignedToId" = (SELECT s."userId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid())));
GRANT SELECT ("id", "emoji", "avatarUrl", "accent", "companyId", "leadNo", "title", "clientId", "contactName", "contactEmail", "contactPhone", "stage", "probability", "estimatedValue", "currency", "services", "details", "source", "sourceChannel", "utmSource", "utmMedium", "utmCampaign", "utmTerm", "utmContent", "referrer", "landingPage", "assignedToId", "createdById", "lostReason", "firstContactAt", "wonAt", "lostAt", "customFields", "score", "convertedAt", "convertedById", "convertedDealId", "convertedPersonId", "convertedClientId", "archivedAt", "archivedById", "createdAt", "updatedAt") ON "CrmLead" TO vane_reader_rep;
CREATE POLICY "vane_rep" ON "CrmLeadDocument" AS RESTRICTIVE FOR SELECT TO vane_reader_rep USING (("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid())) AND ((SELECT s."userId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()) IS NULL OR EXISTS (SELECT 1 FROM "CrmDeal" p WHERE p."id" = "CrmLeadDocument"."dealId") OR EXISTS (SELECT 1 FROM "CrmLead" p WHERE p."id" = "CrmLeadDocument"."leadId")));
GRANT SELECT ("id", "companyId", "leadId", "dealId", "type", "quotationId", "invoiceId", "receiptId", "amount", "currency", "version", "supersedesId", "revisionNote", "isDeposit", "renderTemplateId", "createdById", "createdAt") ON "CrmLeadDocument" TO vane_reader_rep;
CREATE POLICY "vane_rep" ON "CrmSiteVisitSection" AS RESTRICTIVE FOR SELECT TO vane_reader_rep USING (("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid())) AND ((SELECT s."userId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()) IS NULL OR EXISTS (SELECT 1 FROM "CrmAppointment" p WHERE p."id" = "CrmSiteVisitSection"."appointmentId")));
GRANT SELECT ("id", "companyId", "appointmentId", "productId", "questionSetId", "name", "kind", "position", "createdAt", "updatedAt") ON "CrmSiteVisitSection" TO vane_reader_rep;
CREATE POLICY "vane_rep" ON "CrmSiteVisitAnswer" AS RESTRICTIVE FOR SELECT TO vane_reader_rep USING (("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid())) AND ((SELECT s."userId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()) IS NULL OR EXISTS (SELECT 1 FROM "CrmSiteVisitSection" p WHERE p."id" = "CrmSiteVisitAnswer"."sectionId")));
GRANT SELECT ("id", "companyId", "sectionId", "questionId", "questionKey", "questionLabel", "questionType", "position", "valueText", "valueNumber", "valueBool", "valueOptions", "valueDate", "valueJson", "notes", "notApplicable", "answeredAt", "answeredById") ON "CrmSiteVisitAnswer" TO vane_reader_rep;
CREATE POLICY "vane_rep" ON "CrmSiteVisitPhoto" AS RESTRICTIVE FOR SELECT TO vane_reader_rep USING (("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid())) AND ((SELECT s."userId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()) IS NULL OR EXISTS (SELECT 1 FROM "CrmAppointment" p WHERE p."id" = "CrmSiteVisitPhoto"."appointmentId")));
GRANT SELECT ("id", "companyId", "appointmentId", "sectionId", "answerId", "evidenceKey", "blobPathname", "url", "contentType", "size", "width", "height", "caption", "fileName", "capturedAt", "latitude", "longitude", "clientPhotoId", "uploadedById", "createdAt") ON "CrmSiteVisitPhoto" TO vane_reader_rep;
CREATE POLICY "vane_rep" ON "CrmSiteVisitItem" AS RESTRICTIVE FOR SELECT TO vane_reader_rep USING (("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid())) AND ((SELECT s."userId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()) IS NULL OR EXISTS (SELECT 1 FROM "CrmAppointment" p WHERE p."id" = "CrmSiteVisitItem"."appointmentId")));
GRANT SELECT ("id", "companyId", "appointmentId", "position", "category", "description", "quantity", "unit", "widthMm", "heightMm", "depthMm", "specNotes", "unitPrice", "createdAt", "updatedAt") ON "CrmSiteVisitItem" TO vane_reader_rep;
CREATE POLICY "vane_rep" ON "SalesQuotation" AS RESTRICTIVE FOR SELECT TO vane_reader_rep USING (("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid())) AND ((SELECT s."userId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()) IS NULL OR EXISTS (SELECT 1 FROM "CrmLeadDocument" d WHERE d."quotationId" = "SalesQuotation"."id")));
GRANT SELECT ("id", "companyId", "customerId", "quotationNumber", "quotationDate", "validUntil", "status", "currency", "subTotal", "taxTotal", "total", "notes", "createdById", "madeByVane", "issuedById", "issuedAt", "createdAt", "updatedAt") ON "SalesQuotation" TO vane_reader_rep;
CREATE POLICY "vane_rep" ON "SalesQuotationLine" AS RESTRICTIVE FOR SELECT TO vane_reader_rep USING ((EXISTS (SELECT 1 FROM "SalesQuotation" p WHERE p."id" = "SalesQuotationLine"."quotationId") OR EXISTS (SELECT 1 FROM "TaxCode" p WHERE p."id" = "SalesQuotationLine"."taxCodeId") OR EXISTS (SELECT 1 FROM "Product" p WHERE p."id" = "SalesQuotationLine"."productId")) AND ((SELECT s."userId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()) IS NULL OR EXISTS (SELECT 1 FROM "SalesQuotation" p WHERE p."id" = "SalesQuotationLine"."quotationId")));
GRANT SELECT ("id", "quotationId", "description", "quantity", "unitPrice", "productId", "taxCodeId", "taxRate", "taxAmount", "lineTotal", "createdAt") ON "SalesQuotationLine" TO vane_reader_rep;
CREATE POLICY "vane_rep" ON "CrmClient" AS RESTRICTIVE FOR SELECT TO vane_reader_rep USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "avatarUrl", "accent", "emoji", "companyId", "clientNo", "name", "tradingName", "companyType", "registrationNumber", "taxNumber", "website", "websiteDomain", "industry", "contactName", "email", "emailNormalized", "phone", "phoneE164", "addressLine", "city", "country", "billingAddress", "accountStatus", "parentClientId", "parentRelation", "notes", "tags", "customFields", "customerId", "assignedToId", "lastContactedAt", "archivedAt", "mergedIntoId", "createdAt", "updatedAt") ON "CrmClient" TO vane_reader_rep;
CREATE POLICY "vane_rep" ON "CrmPerson" AS RESTRICTIVE FOR SELECT TO vane_reader_rep USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "avatarUrl", "accent", "emoji", "companyId", "personNo", "firstName", "lastName", "fullName", "jobTitle", "email", "emailNormalized", "additionalEmails", "phone", "phoneE164", "additionalPhones", "contactType", "preferredChannel", "addressLine", "city", "country", "notes", "tags", "clientId", "assignedToId", "sourceType", "convertedFromLeadId", "customFields", "lastContactedAt", "archivedAt", "mergedIntoId", "createdById", "createdAt", "updatedAt") ON "CrmPerson" TO vane_reader_rep;
CREATE POLICY "vane_rep" ON "CrmSite" AS RESTRICTIVE FOR SELECT TO vane_reader_rep USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "avatarUrl", "accent", "emoji", "companyId", "siteNo", "name", "clientId", "addressLine", "city", "country", "latitude", "longitude", "primaryContactId", "accessInstructions", "siteConditions", "photos", "notes", "tags", "customFields", "archivedAt", "createdById", "createdAt", "updatedAt") ON "CrmSite" TO vane_reader_rep;
CREATE POLICY "vane_rep" ON "CrmPipelineStage" AS RESTRICTIVE FOR SELECT TO vane_reader_rep USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "pipelineId", "name", "position", "status", "probability", "inactivityDays", "requiredFields", "checklist", "requiresSiteVisit", "requiresQuotation", "archivedAt", "createdAt", "updatedAt") ON "CrmPipelineStage" TO vane_reader_rep;
CREATE POLICY "vane_rep" ON "CrmQuestionSet" AS RESTRICTIVE FOR SELECT TO vane_reader_rep USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "key", "name", "kind", "productId", "position", "isActive", "sourceTemplateKey", "quoteLines", "archivedAt", "createdById", "createdAt", "updatedAt") ON "CrmQuestionSet" TO vane_reader_rep;
CREATE POLICY "vane_rep" ON "CrmQuestion" AS RESTRICTIVE FOR SELECT TO vane_reader_rep USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "questionSetId", "key", "label", "helpText", "type", "options", "unit", "settings", "isRequired", "requiresPhoto", "needsReview", "position", "archivedAt", "createdAt", "updatedAt") ON "CrmQuestion" TO vane_reader_rep;
CREATE POLICY "vane_rep" ON "Product" AS RESTRICTIVE FOR SELECT TO vane_reader_rep USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "code", "name", "description", "kind", "category", "categoryId", "unit", "unitLabel", "standardPrice", "costPrice", "defaultTaxRate", "currency", "maxDiscountPercent", "barcode", "ageRestricted", "returnable", "depositAmount", "packOfId", "packSize", "breakAtTill", "openPrice", "supplierId", "imageUrl", "notes", "isActive", "archivedAt", "attributes", "createdById", "createdAt", "updatedAt") ON "Product" TO vane_reader_rep;
