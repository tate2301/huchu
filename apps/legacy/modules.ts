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
import { onFiscalBacklog, registerFiscalDrainIssuer } from "@corelithzw/module-books/fiscal-drain";
import { registerDocumentSource } from "@corelithzw/module-documents/source-registry";
import { registerSearchArm } from "@corelithzw/module-records/search";
import { onApprovalAction } from "@corelithzw/module-workflow/approvals";

registerAuthOptions(async () => (await import("@/lib/auth")).authOptions);

// Code the modules hook into each other with, wired here and imported on first
// use, so reading the composition costs nothing but the manifests. After an
// approval action, for this host: the approvers are told.
onApprovalAction(async (tx, event) =>
  (await import("@/lib/notifications")).emitWorkflowNotificationFromApprovalAction(tx, event),
);

// The search box's arms: one per module with records worth typing at.
registerSearchArm({ id: "crm", run: async (db, input) => (await import("@/lib/crm/search")).searchCrm(db, input) });
registerSearchArm({
  id: "schools",
  run: async (db, input) => {
    const { searchSchools } = await import("@/lib/schools/search");
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
    const { searchRetail } = await import("@/lib/retail/search");
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
  resolve: async (input) => {
    const { isSchoolDocumentSourceKey, resolveSchoolDocument } = await import("@/lib/schools/document-sources");
    if (!isSchoolDocumentSourceKey(input.sourceKey)) throw new Error(`Unknown sourceKey: ${input.sourceKey}`);
    return resolveSchoolDocument(input.companyId, { ...input, sourceKey: input.sourceKey });
  },
});
registerDocumentSource({
  id: "hr",
  matches: (key) => key.startsWith("hr."),
  resolve: async (input) => {
    const { isHrDocumentSourceKey, resolveHrDocumentSource } = await import("@corelithzw/module-people/hr/document-sources");
    if (!isHrDocumentSourceKey(input.sourceKey)) throw new Error(`Unknown sourceKey: ${input.sourceKey}`);
    return resolveHrDocumentSource({ ...input, sourceKey: input.sourceKey });
  },
});
registerDocumentSource({
  id: "legacy",
  matches: (key) => ["accounting.", "reports.", "dashboard."].some((prefix) => key.startsWith(prefix)),
  resolve: async (input) => (await import("@/lib/host/document-sources")).legacyDocumentSource.resolve(input),
});

// The fiscal drain re-issues receipts other modules write, and raises an
// incident when a tenant is stuck. The school's issuer and the compliance
// module's incident live with their modules.
registerFiscalDrainIssuer("schoolFeeReceipt", async (args) => {
  const { issueSchoolFeeReceiptFiscalisation } = await import("@/lib/schools/fiscalisation");
  const result = await issueSchoolFeeReceiptFiscalisation(args);
  return { status: result.fiscalStatus, error: result.fiscalError ?? null };
});
onFiscalBacklog(async (event) => {
  const [{ emitIncidentNotification }, { prisma }] = await Promise.all([
    import("@/lib/notifications"),
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
