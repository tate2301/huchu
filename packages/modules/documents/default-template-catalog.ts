import { registeredModules } from "@corelithzw/platform/manifest";
import { defaultTemplateSchema, type DocumentTemplateSchema } from "./template-schema";

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

export function mergeSchema(overrides: TemplateSchemaOverrides): DocumentTemplateSchema {
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

export function reportTemplate(documentTitle: string): DocumentTemplateSchema {
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

export function recordTemplate(documentTitle: string): DocumentTemplateSchema {
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
export function letterTemplate(documentTitle: string): DocumentTemplateSchema {
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

/** The one template this module owns: a table exported from any screen. */
const OWN_TEMPLATES: DefaultTemplateCatalogEntry[] = [
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

/**
 * Every default template: this module's own, then what the registered
 * manifests declare (`documents.templates`), in registration order.
 */
export function defaultTemplateCatalog(): DefaultTemplateCatalogEntry[] {
  return [
    ...OWN_TEMPLATES,
    ...registeredModules().flatMap(
      (manifest) => (manifest.documents?.templates ?? []) as readonly DefaultTemplateCatalogEntry[],
    ),
  ];
}

export function resolveCatalogTemplateEntry(input: {
  sourceKey: string;
  documentType: DefaultTemplateCatalogEntry["documentType"];
  targetType: DefaultTemplateCatalogEntry["targetType"];
}): DefaultTemplateCatalogEntry | null {
  const exact =
    defaultTemplateCatalog().find(
      (entry) =>
        entry.sourceKey === input.sourceKey &&
        entry.documentType === input.documentType &&
        entry.targetType === input.targetType,
    ) ?? null;
  if (exact) return exact;

  if (input.sourceKey.startsWith("ui.table.")) {
    return (
      defaultTemplateCatalog().find(
        (entry) =>
          entry.sourceKey === "ui.table.*" &&
          entry.documentType === input.documentType &&
          entry.targetType === input.targetType,
      ) ?? null
    );
  }

  return null;
}
