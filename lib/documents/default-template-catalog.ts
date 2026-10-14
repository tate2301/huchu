import { defaultTemplateSchema, type DocumentTemplateSchema } from "@/lib/documents/template-schema";

export type DefaultTemplateCatalogEntry = {
  key: string;
  sourceKey: string;
  documentType:
    | "REPORT_TABLE"
    | "DASHBOARD_PACK"
    | "SALES_INVOICE"
    | "SALES_QUOTATION"
    | "SALES_RECEIPT"
    | "GENERIC_RECORD";
  targetType: "LIST" | "RECORD" | "DASHBOARD";
  name: string;
  description: string;
  schema: DocumentTemplateSchema;
};

type TemplateSchemaOverrides = {
  page?: Partial<DocumentTemplateSchema["page"]>;
  header?: Partial<DocumentTemplateSchema["header"]>;
  table?: Partial<DocumentTemplateSchema["table"]>;
  footer?: Partial<DocumentTemplateSchema["footer"]>;
  labels?: Partial<DocumentTemplateSchema["labels"]>;
};

function mergeSchema(overrides: TemplateSchemaOverrides): DocumentTemplateSchema {
  return {
    ...defaultTemplateSchema,
    ...overrides,
    page: {
      ...defaultTemplateSchema.page,
      ...(overrides.page ?? {}),
    },
    header: {
      ...defaultTemplateSchema.header,
      ...(overrides.header ?? {}),
    },
    table: {
      ...defaultTemplateSchema.table,
      ...(overrides.table ?? {}),
      columns: overrides.table?.columns ?? defaultTemplateSchema.table.columns,
    },
    footer: {
      ...defaultTemplateSchema.footer,
      ...(overrides.footer ?? {}),
    },
    labels: {
      ...defaultTemplateSchema.labels,
      ...(overrides.labels ?? {}),
    },
  };
}

function reportTemplate(documentTitle: string): DocumentTemplateSchema {
  return mergeSchema({
    page: {
      orientation: "landscape",
      marginMm: 15,
    },
    table: {
      compact: true,
      zebra: true,
    },
    labels: {
      documentTitle,
      documentNumber: "Reference",
      documentDate: "Generated",
      customer: "Party",
    },
    footer: {
      showPaymentDetails: false,
    },
  });
}

function recordTemplate(documentTitle: string): DocumentTemplateSchema {
  return mergeSchema({
    page: {
      orientation: "portrait",
      marginMm: 20,
    },
    table: {
      compact: false,
      zebra: true,
    },
    labels: {
      documentTitle,
    },
    footer: {
      showFooterText: true,
      showDisclaimer: true,
      showPaymentDetails: true,
      // A tenant who uploads a signature and a stamp has said what they want
      // on their paper; leaving these off meant the assets were accepted,
      // stored, and never printed. The renderer draws each only where the
      // asset exists, so this turns nothing on for a tenant with none.
      showSignature: true,
      showStamp: true,
    },
  });
}

/**
 * A record document that is not a bill. A report card with the school's bank
 * account at the foot reads as an invoice for the marks; the bank block
 * belongs only on paper that asks for money.
 */
function letterTemplate(documentTitle: string): DocumentTemplateSchema {
  return mergeSchema({
    page: {
      orientation: "portrait",
      marginMm: 20,
    },
    table: {
      compact: false,
      zebra: true,
    },
    labels: {
      documentTitle,
    },
    footer: {
      showFooterText: false,
      showDisclaimer: true,
      showPaymentDetails: false,
    },
  });
}

export const DEFAULT_TEMPLATE_CATALOG: DefaultTemplateCatalogEntry[] = [
  {
    key: "reports.shift",
    sourceKey: "reports.shift",
    documentType: "REPORT_TABLE",
    targetType: "LIST",
    name: "Shift report",
    description: "The shift reports list, on your letterhead, ready to print.",
    schema: reportTemplate("Shift report"),
  },
  {
    key: "reports.attendance",
    sourceKey: "reports.attendance",
    documentType: "REPORT_TABLE",
    targetType: "LIST",
    name: "Attendance report",
    description: "The attendance list, on your letterhead, ready to print.",
    schema: reportTemplate("Attendance report"),
  },
  {
    key: "reports.plant",
    sourceKey: "reports.plant",
    documentType: "REPORT_TABLE",
    targetType: "LIST",
    name: "Plant report",
    description: "The plant reports list, on your letterhead, ready to print.",
    schema: reportTemplate("Plant report"),
  },
  {
    key: "dashboard.executive-summary",
    sourceKey: "dashboard.executive-summary",
    documentType: "DASHBOARD_PACK",
    targetType: "DASHBOARD",
    name: "Executive summary",
    description: "The workspace's key figures on one page, on your letterhead.",
    schema: mergeSchema({
      page: {
        orientation: "portrait",
        marginMm: 20,
      },
      table: {
        compact: true,
      },
      labels: {
        documentTitle: "Executive summary",
      },
      footer: {
        showPaymentDetails: false,
      },
    }),
  },
  {
    key: "accounting.sales.invoice",
    sourceKey: "accounting.sales.invoice",
    documentType: "SALES_INVOICE",
    targetType: "RECORD",
    name: "Sales invoice",
    description: "An invoice to a customer, on your letterhead.",
    schema: recordTemplate("Invoice"),
  },
  {
    key: "accounting.sales.quotation",
    sourceKey: "accounting.sales.quotation",
    documentType: "SALES_QUOTATION",
    targetType: "RECORD",
    name: "Sales quotation",
    description: "A quotation to a customer, on your letterhead.",
    schema: recordTemplate("Quotation"),
  },
  {
    key: "accounting.sales.receipt",
    sourceKey: "accounting.sales.receipt",
    documentType: "SALES_RECEIPT",
    targetType: "RECORD",
    name: "Sales receipt",
    description: "A receipt for a payment, on your letterhead.",
    schema: recordTemplate("Payment receipt"),
  },
  {
    key: "accounting.sales.credit-note",
    sourceKey: "accounting.sales.credit-note",
    documentType: "GENERIC_RECORD",
    targetType: "RECORD",
    name: "Credit note",
    description: "A credit against an invoice, on your letterhead.",
    schema: recordTemplate("Credit note"),
  },
  // Iteration 5 — the school's paper. Each of these is bound to a real template a
  // school can edit the wording of, which is the difference between a document and
  // a hard-coded print view.
  {
    key: "schools.fee.invoice",
    sourceKey: "schools.fee.invoice",
    documentType: "SALES_INVOICE",
    targetType: "RECORD",
    name: "School fee invoice",
    description: "Termly fee invoice addressed to the family.",
    schema: recordTemplate("Fee invoice"),
  },
  {
    key: "schools.fee.receipt",
    sourceKey: "schools.fee.receipt",
    documentType: "SALES_RECEIPT",
    targetType: "RECORD",
    name: "School fee receipt",
    description: "Proof of a fee payment, showing what it was put against.",
    schema: recordTemplate("Fee receipt"),
  },
  {
    key: "schools.fee.statement",
    sourceKey: "schools.fee.statement",
    documentType: "GENERIC_RECORD",
    targetType: "RECORD",
    name: "School fee statement",
    description: "Every charge and payment for one pupil, with the closing balance.",
    schema: recordTemplate("Fee statement"),
  },
  {
    key: "schools.report-card",
    sourceKey: "schools.report-card",
    documentType: "GENERIC_RECORD",
    targetType: "RECORD",
    name: "School report card",
    description: "A term's published marks per subject, with the pass outcome.",
    schema: letterTemplate("Report card"),
  },
  {
    key: "schools.admission-letter",
    sourceKey: "schools.admission-letter",
    documentType: "GENERIC_RECORD",
    targetType: "RECORD",
    name: "School admission letter",
    description: "The offer of a place, addressed to the parent who applied.",
    schema: letterTemplate("Offer of a place"),
  },
  {
    key: "schools.transfer-letter",
    sourceKey: "schools.transfer-letter",
    documentType: "GENERIC_RECORD",
    targetType: "RECORD",
    name: "School transfer letter",
    description: "Confirmation a pupil was here, with any fees still outstanding.",
    schema: letterTemplate("Transfer letter"),
  },
  {
    key: "schools.class-list",
    sourceKey: "schools.class-list",
    documentType: "REPORT_TABLE",
    targetType: "LIST",
    name: "School class list",
    description: "A class's roll with guardians and phone numbers.",
    schema: reportTemplate("Class list"),
  },
  {
    key: "schools.attendance-register",
    sourceKey: "schools.attendance-register",
    documentType: "REPORT_TABLE",
    targetType: "LIST",
    name: "School attendance register",
    description: "A blank week's register, for the days the line is down.",
    schema: reportTemplate("Attendance register"),
  },
  {
    key: "hr.payslip",
    sourceKey: "hr.payslip",
    documentType: "GENERIC_RECORD",
    targetType: "RECORD",
    name: "Payslip",
    description:
      "One employee's pay for one period, showing every stage of the calculation and what the employer contributed.",
    // A letter, not a bill. A payslip carrying the company's bank details reads
    // like a demand for money from the person it is paying.
    schema: letterTemplate("Payslip"),
  },
  {
    key: "ui.table.*",
    sourceKey: "ui.table.*",
    documentType: "REPORT_TABLE",
    targetType: "LIST",
    name: "Table export",
    description: "Any table in the app, on your letterhead, ready to print.",
    schema: reportTemplate("Table export"),
  },
];

export function resolveCatalogTemplateEntry(input: {
  sourceKey: string;
  documentType: DefaultTemplateCatalogEntry["documentType"];
  targetType: DefaultTemplateCatalogEntry["targetType"];
}): DefaultTemplateCatalogEntry | null {
  const exact =
    DEFAULT_TEMPLATE_CATALOG.find(
      (entry) =>
        entry.sourceKey === input.sourceKey &&
        entry.documentType === input.documentType &&
        entry.targetType === input.targetType,
    ) ?? null;
  if (exact) return exact;

  if (input.sourceKey.startsWith("ui.table.")) {
    return (
      DEFAULT_TEMPLATE_CATALOG.find(
        (entry) =>
          entry.sourceKey === "ui.table.*" &&
          entry.documentType === input.documentType &&
          entry.targetType === input.targetType,
      ) ?? null
    );
  }

  return null;
}
