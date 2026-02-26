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
    schema: recordTemplate("Sales Invoice"),
  },
  {
    key: "accounting.sales.quotation",
    sourceKey: "accounting.sales.quotation",
    documentType: "SALES_QUOTATION",
    targetType: "RECORD",
    name: "Sales Quotation Default",
    description: "Default branded sales quotation layout.",
    schema: recordTemplate("Sales Quotation"),
  },
  {
    key: "accounting.sales.receipt",
    sourceKey: "accounting.sales.receipt",
    documentType: "SALES_RECEIPT",
    targetType: "RECORD",
    name: "Sales Receipt Default",
    description: "Default branded sales receipt layout.",
    schema: recordTemplate("Sales Receipt"),
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
