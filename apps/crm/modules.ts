/**
 * How the CRM host is wired: the code its modules hook into each other
 * with, and how it authenticates. What it composes is `manifests.ts`,
 * imported first. Server only; imported once at boot from
 * `instrumentation.ts`, and by any test that reads a registry filled here.
 */
import { registerAuthOptions } from "@corelithzw/platform/auth-core/auth-options";
import "./manifests";
import "./modules.client";
import { onSalesInvoiceCreated, onSalesReceiptCreated } from "@corelithzw/module-books/sales-hooks";
import { registerDocumentSource } from "@corelithzw/module-documents/source-registry";
import { registerSearchArm } from "@corelithzw/module-records/search";
import { registerRecordSubjectGuard } from "@corelithzw/module-records/subject-guard";
import { onApprovalAction } from "@corelithzw/module-workflow/approvals";

registerAuthOptions(async () => (await import("@/lib/auth")).authOptions);

// After an approval action: the people the entity concerns are told. The
// people module's entities are the only approvable ones this host runs.
onApprovalAction(async (tx, event) => {
  const { emitPeopleApprovalNotification } = await import("@corelithzw/module-people/approval-notifications");
  await emitPeopleApprovalNotification(tx, event);
});

// Who may file against a record: the CRM decides for its record types.
registerRecordSubjectGuard("crm", async (session, action) => (await import("@corelithzw/module-crm/record-guard")).crmRecordGuard(session, action));

// The search box's arms: the CRM's records and the staff directory.
registerSearchArm({ id: "crm", run: async (db, input) => (await import("@corelithzw/module-crm/search")).searchCrm(db, input) });
registerSearchArm({
  id: "people",
  run: async (db, input) => {
    const { searchPeople } = await import("@corelithzw/module-people/people/search");
    return searchPeople(db, { ...input, types: input.types as Parameters<typeof searchPeople>[1]["types"] });
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

// The books announce a sales document; the CRM, downstream of the money,
// keeps its quote and its deal in step.
onSalesInvoiceCreated(async (event) => (await import("@corelithzw/module-crm/accounting-hooks")).onAccountingInvoiceCreated(event));
onSalesReceiptCreated(async (event) => (await import("@corelithzw/module-crm/accounting-hooks")).onAccountingReceiptCreated(event));
