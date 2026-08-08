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
      marginMm: 8,
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
      marginMm: 10,
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
      marginMm: 10,
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
    name: "Shift Report Default",
    description: "Default print-ready template for shift report list exports.",
    schema: reportTemplate("Shift Report"),
  },
  {
    key: "reports.attendance",
    sourceKey: "reports.attendance",
    documentType: "REPORT_TABLE",
    targetType: "LIST",
    name: "Attendance Report Default",
    description: "Default print-ready template for attendance report list exports.",
    schema: reportTemplate("Attendance Report"),
  },
  {
    key: "reports.plant",
    sourceKey: "reports.plant",
    documentType: "REPORT_TABLE",
    targetType: "LIST",
    name: "Plant Report Default",
    description: "Default print-ready template for plant report list exports.",
    schema: reportTemplate("Plant Report"),
  },
  {
    key: "dashboard.executive-summary",
    sourceKey: "dashboard.executive-summary",
    documentType: "DASHBOARD_PACK",
    targetType: "DASHBOARD",
    name: "Executive Dashboard Default",
    description: "Default branded dashboard summary template.",
    schema: mergeSchema({
      page: {
        orientation: "portrait",
        marginMm: 10,
      },
      table: {
        compact: true,
      },
      labels: {
        documentTitle: "Executive Summary",
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
    name: "Sales Invoice Default",
    description: "Default branded sales invoice layout.",
    schema: recordTemplate("Invoice"),
  },
  {
    key: "accounting.sales.quotation",
    sourceKey: "accounting.sales.quotation",
    documentType: "SALES_QUOTATION",
    targetType: "RECORD",
    name: "Sales Quotation Default",
    description: "Default branded sales quotation layout.",
    schema: recordTemplate("Quotation"),
  },
  {
    key: "accounting.sales.receipt",
    sourceKey: "accounting.sales.receipt",
    documentType: "SALES_RECEIPT",
    targetType: "RECORD",
    name: "Sales Receipt Default",
    description: "Default branded sales receipt layout.",
    schema: recordTemplate("Payment Receipt"),
  },
  {
    key: "accounting.sales.credit-note",
    sourceKey: "accounting.sales.credit-note",
    documentType: "GENERIC_RECORD",
    targetType: "RECORD",
    name: "Credit Note Default",
    description: "Default branded credit note layout.",
    schema: recordTemplate("Credit Note"),
  },
  {
    key: "scrap-metal.purchase-ticket",
    sourceKey: "scrap-metal.purchase-ticket",
    documentType: "GENERIC_RECORD",
    targetType: "RECORD",
    name: "Scrap Inbound Ticket Default",
    description: "Default branded inbound ticket layout for scrap operations.",
    schema: recordTemplate("Inbound Ticket"),
  },
  {
    key: "scrap-metal.sale-ticket",
    sourceKey: "scrap-metal.sale-ticket",
    documentType: "GENERIC_RECORD",
    targetType: "RECORD",
    name: "Scrap Outbound Ticket Default",
    description: "Default branded outbound ticket layout for scrap operations.",
    schema: recordTemplate("Outbound Ticket"),
  },
  // Iteration 5 — the school's paper. Each of these is bound to a real template a
  // school can edit the wording of, which is the difference between a document and
  // a hard-coded print view.
  {
    key: "schools.fee.invoice",
    sourceKey: "schools.fee.invoice",
    documentType: "SALES_INVOICE",
    targetType: "RECORD",
    name: "School Fee Invoice Default",
    description: "Termly fee invoice addressed to the family.",
    schema: recordTemplate("Fee Invoice"),
  },
  {
    key: "schools.fee.receipt",
    sourceKey: "schools.fee.receipt",
    documentType: "SALES_RECEIPT",
    targetType: "RECORD",
    name: "School Fee Receipt Default",
    description: "Proof of a fee payment, showing what it was put against.",
    schema: recordTemplate("Fee Receipt"),
  },
  {
    key: "schools.fee.statement",
    sourceKey: "schools.fee.statement",
    documentType: "GENERIC_RECORD",
    targetType: "RECORD",
    name: "School Fee Statement Default",
    description: "Every charge and payment for one pupil, with the closing balance.",
    schema: recordTemplate("Fee Statement"),
  },
  {
    key: "schools.report-card",
    sourceKey: "schools.report-card",
    documentType: "GENERIC_RECORD",
    targetType: "RECORD",
    name: "School Report Card Default",
    description: "A term's published marks per subject, with the pass outcome.",
    schema: letterTemplate("Report Card"),
  },
  {
    key: "schools.admission-letter",
    sourceKey: "schools.admission-letter",
    documentType: "GENERIC_RECORD",
    targetType: "RECORD",
    name: "School Admission Letter Default",
    description: "The offer of a place, addressed to the parent who applied.",
    schema: letterTemplate("Offer of a Place"),
  },
  {
    key: "schools.transfer-letter",
    sourceKey: "schools.transfer-letter",
    documentType: "GENERIC_RECORD",
    targetType: "RECORD",
    name: "School Transfer Letter Default",
    description: "Confirmation a pupil was here, with any fees still outstanding.",
    schema: letterTemplate("Transfer Letter"),
  },
  {
    key: "schools.class-list",
    sourceKey: "schools.class-list",
    documentType: "REPORT_TABLE",
    targetType: "LIST",
    name: "School Class List Default",
    description: "A class's roll with guardians and phone numbers.",
    schema: reportTemplate("Class List"),
  },
  {
    key: "schools.attendance-register",
    sourceKey: "schools.attendance-register",
    documentType: "REPORT_TABLE",
    targetType: "LIST",
    name: "School Attendance Register Default",
    description: "A blank week's register, for the days the line is down.",
    schema: reportTemplate("Attendance Register"),
  },
  {
    key: "hr.payslip",
    sourceKey: "hr.payslip",
    documentType: "GENERIC_RECORD",
    targetType: "RECORD",
    name: "Payslip Default",
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
    name: "Generic Table Default",
    description: "Default template for dynamically generated UI table exports.",
    schema: reportTemplate("Table Export"),
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
