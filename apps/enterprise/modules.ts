/**
 * How this host is wired: the code its modules hook into each other with, and
 * how it authenticates. What it composes is `manifests.ts`, imported first.
 *
 * Server only. Imported once at boot from `instrumentation.ts`, and by any
 * test that reads a registry the code below fills.
 *
 * The auth options are handed over lazily. `lib/auth.ts` validates its
 * environment and builds the adapter when it loads, so importing it here would
 * make reading the composition cost the whole auth stack; the first request
 * that needs a session pays that import once instead, exactly as it did when
 * every page imported the options itself.
 */
import { registerAuthOptions } from "@corelithzw/platform/auth-core/auth-options";
import "./manifests";
import "./modules.client";
import { onFiscalBacklog, registerFiscalDrainIssuer, registerFiscalDrainSweep } from "@corelithzw/module-books/fiscal-drain";
import { onSalesInvoiceCreated, onSalesReceiptCreated } from "@corelithzw/module-books/sales-hooks";
import { registerDocumentSource } from "@corelithzw/module-documents/source-registry";
import { registerSearchArm } from "@corelithzw/module-records/search";
import { registerRecordSubjectGuard } from "@corelithzw/module-records/subject-guard";
import { onApprovalAction } from "@corelithzw/module-workflow/approvals";

registerAuthOptions(async () => (await import("@/lib/auth")).authOptions);

// Code the modules hook into each other with, wired here and imported on first
// use, so reading the composition costs nothing but the manifests. After an
// approval action, for this host: the people the entity concerns are told —
// the people module's entities by its emitter, the gold module's settlement
// allocations by its own. Each returns at once for an entity it does not own.
onApprovalAction(async (tx, event) => {
  const [{ emitPeopleApprovalNotification }, { emitGoldApprovalNotification }] = await Promise.all([
    import("@corelithzw/module-people/approval-notifications"),
    import("@corelithzw/module-gold/approval-notifications"),
  ]);
  await emitPeopleApprovalNotification(tx, event);
  await emitGoldApprovalNotification(tx, event);
});

// Who may file against a record: the module that owns the record type decides.
registerRecordSubjectGuard("crm", async (session, action) => (await import("@corelithzw/module-crm/record-guard")).crmRecordGuard(session, action));
registerRecordSubjectGuard("schools", async (session, action) => (await import("@corelithzw/module-campus/record-guard")).schoolRecordGuard(session, action));

// The search box's arms: one per module with records worth typing at.
registerSearchArm({ id: "crm", run: async (db, input) => (await import("@corelithzw/module-crm/search")).searchCrm(db, input) });
registerSearchArm({
  id: "schools",
  run: async (db, input) => {
    const { searchSchools } = await import("@corelithzw/module-campus/search");
    return searchSchools(db, { ...input, types: input.types as Parameters<typeof searchSchools>[1]["types"] });
  },
});
registerSearchArm({
  id: "people",
  run: async (db, input) => {
    const { searchPeople } = await import("@corelithzw/module-people/people/search");
    return searchPeople(db, { ...input, types: input.types as Parameters<typeof searchPeople>[1]["types"] });
  },
});
registerSearchArm({
  id: "gold",
  run: async (db, input) => {
    const { searchGold } = await import("@corelithzw/module-gold/gold/search");
    return searchGold(db, { ...input, types: input.types as Parameters<typeof searchGold>[1]["types"] });
  },
});
registerSearchArm({
  id: "retail",
  run: async (db, input) => {
    const { searchRetail } = await import("@corelithzw/module-sell/search");
    return searchRetail(db, { ...input, types: input.types as Parameters<typeof searchRetail>[1]["types"] });
  },
});
registerSearchArm({
  id: "operations",
  run: async (db, input) => {
    const { searchOperations } = await import("@corelithzw/module-gold/operations/search");
    return searchOperations(db, { ...input, types: input.types as Parameters<typeof searchOperations>[1]["types"] });
  },
});

// Where each printable document's content comes from, by the module that owns
// the records. The school and payroll sources move with their modules.
registerDocumentSource({
  id: "schools",
  matches: (key) => key.startsWith("schools."),
  access: async (key) => ({ featureKeys: (await import("@corelithzw/module-campus/document-sources")).schoolDocumentFeatureKeys(key) }),
  authorize: async (input) => (await import("@corelithzw/module-campus/document-sources")).authorizeSchoolDocument(input),
  resolve: async (input) => {
    const { isSchoolDocumentSourceKey, resolveSchoolDocument } = await import("@corelithzw/module-campus/document-sources");
    if (!isSchoolDocumentSourceKey(input.sourceKey)) throw new Error(`Unknown sourceKey: ${input.sourceKey}`);
    return resolveSchoolDocument(input.companyId, { ...input, sourceKey: input.sourceKey });
  },
});
registerDocumentSource({
  id: "hr",
  matches: (key) => key.startsWith("hr."),
  access: async (key) => ({ featureKeys: (await import("@corelithzw/module-people/hr/document-sources")).hrDocumentFeatureKeys(key) }),
  authorize: async (input) => (await import("@corelithzw/module-people/hr/document-sources")).authorizeHrDocument(input),
  resolve: async (input) => {
    const { isHrDocumentSourceKey, resolveHrDocumentSource } = await import("@corelithzw/module-people/hr/document-sources");
    if (!isHrDocumentSourceKey(input.sourceKey)) throw new Error(`Unknown sourceKey: ${input.sourceKey}`);
    return resolveHrDocumentSource({ ...input, sourceKey: input.sourceKey });
  },
});
registerDocumentSource({
  id: "books",
  matches: (key) => key.startsWith("accounting."),
  access: async (key) => ({ featureKeys: (await import("@corelithzw/module-books/document-sources")).booksDocumentFeatureKeys(key) }),
  resolve: async (input) => (await import("@corelithzw/module-books/document-sources")).resolveBooksDocument(input),
});
registerDocumentSource({
  id: "enterprise",
  matches: (key) => ["reports.", "dashboard."].some((prefix) => key.startsWith(prefix)),
  resolve: async (input) => (await import("@/lib/host/document-sources")).enterpriseDocumentSource.resolve(input),
});

// The fiscal drain re-issues receipts other modules write, and raises an
// incident when a tenant is stuck. The school's issuer and the compliance
// module's incident live with their modules.
registerFiscalDrainIssuer("schoolFeeReceipt", async (args) => {
  const { issueSchoolFeeReceiptFiscalisation } = await import("@corelithzw/module-campus/fiscalisation");
  const result = await issueSchoolFeeReceiptFiscalisation(args);
  return { status: result.fiscalStatus, error: result.fiscalError ?? null };
});
registerFiscalDrainSweep("schoolFeeReceipt", {
  unattempted: async (args) => (await import("@corelithzw/module-campus/fiscalisation")).unattemptedSchoolFeeReceipts(args),
});

// The books announce a sales document; the CRM, downstream of the money,
// keeps its quote and its deal in step.
onSalesInvoiceCreated(async (event) => (await import("@corelithzw/module-crm/accounting-hooks")).onAccountingInvoiceCreated(event));
onSalesReceiptCreated(async (event) => (await import("@corelithzw/module-crm/accounting-hooks")).onAccountingReceiptCreated(event));
onFiscalBacklog(async (event) => {
  const [{ emitIncidentNotification }, { prisma }] = await Promise.all([
    import("@corelithzw/module-compliance/notifications"),
    import("@corelithzw/db/client"),
  ]);
  await emitIncidentNotification(prisma, {
    companyId: event.companyId,
    actorId: event.actorId,
    event: "CREATED",
    incident: {
      id: event.incidentId,
      incidentType: event.title,
      severity: "CRITICAL",
      status: "OPEN",
      site: { name: "Fiscalisation", code: "fiscalisation" },
    },
  });
});
