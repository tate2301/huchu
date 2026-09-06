/**
 * How the Sell host is wired: the code its modules hook into each other
 * with, and how it authenticates. What it composes is `manifests.ts`,
 * imported first. Server only; imported once at boot from
 * `instrumentation.ts`, and by any test that reads a registry filled here.
 */
import { registerAuthOptions } from "@corelithzw/platform/auth-core/auth-options";
import "./manifests";
import "./modules.client";
import { onFiscalBacklog } from "@corelithzw/module-books/fiscal-drain";
import { registerDocumentSource } from "@corelithzw/module-documents/source-registry";
import { registerSearchArm } from "@corelithzw/module-records/search";
import { onApprovalAction } from "@corelithzw/module-workflow/approvals";

registerAuthOptions(async () => (await import("@/lib/auth")).authOptions);

// After an approval action: the people the entity concerns are told. The
// people module's entities are the only approvable ones this host runs.
onApprovalAction(async (tx, event) => {
  const { emitPeopleApprovalNotification } = await import("@corelithzw/module-people/approval-notifications");
  await emitPeopleApprovalNotification(tx, event);
});

// The search box's arms: the shop's records and the staff directory.
registerSearchArm({
  id: "people",
  run: async (db, input) => {
    const { searchPeople } = await import("@corelithzw/module-people/people/search");
    return searchPeople(db, { ...input, types: input.types as Parameters<typeof searchPeople>[1]["types"] });
  },
});
registerSearchArm({
  id: "retail",
  run: async (db, input) => {
    const { searchRetail } = await import("@corelithzw/module-sell/search");
    return searchRetail(db, { ...input, types: input.types as Parameters<typeof searchRetail>[1]["types"] });
  },
});

// Where each printable document's content comes from, by the module that owns
// the records: the payslip, the books' sales documents.
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

// A tenant whose fiscal drain is stuck becomes a compliance incident.
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
