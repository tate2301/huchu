import { z } from "zod";

const alignSchema = z.enum(["left", "center", "right"]);

export const templateColumnSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  width: z.string().optional(),
  align: alignSchema.optional(),
  mono: z.boolean().optional(),
});

/**
 * A row a person adds to a layout in Build: printed in `part` (an outline id),
 * labelled `label`, and filled from `from`, a field the document's source
 * offers (`payload.fields`). Only the payslip offers fields today
 * (`lib/documents/payslip-rows.ts`).
 */
export const templateRowSchema = z.object({
  part: z.string().min(1).max(40),
  label: z.string().max(80),
  from: z.string().min(1).max(80),
});

export type TemplateRow = z.infer<typeof templateRowSchema>;

/**
 * What a payslip layout shows (PageTemplatePayslip's Show and Hide rows that
 * are zero). Read by `lib/documents/payslip-rows.ts`; other documents ignore it.
 */
export const payslipShowSchema = z.object({
  statutory: z.boolean().default(true),
  otherDeductions: z.boolean().default(true),
  penalties: z.boolean().default(true),
  hideZero: z.boolean().default(true),
});

export type PayslipShow = z.infer<typeof payslipShowSchema>;

export const templateSchema = z.object({
  page: z
    .object({
      size: z.enum(["A4", "LETTER"]).default("A4"),
      orientation: z.enum(["portrait", "landscape"]).default("portrait"),
      // 20mm is an ordinary A4 margin: room for a printer's unprintable edge, a
      // hole punch and a thumb. 10mm read as a page printed to its edge.
      marginMm: z.number().min(5).max(40).default(20),
    })
    .default({ size: "A4", orientation: "portrait", marginMm: 20 }),
  header: z
    .object({
      showLogo: z.boolean().default(true),
      showSecondaryLogo: z.boolean().default(false),
      showCompanyIdentity: z.boolean().default(true),
      showContactBlock: z.boolean().default(true),
    })
    .default({
      showLogo: true,
      showSecondaryLogo: false,
      showCompanyIdentity: true,
      showContactBlock: true,
    }),
  table: z
    .object({
      compact: z.boolean().default(false),
      zebra: z.boolean().default(true),
      columns: z.array(templateColumnSchema).default([]),
    })
    .default({ compact: false, zebra: true, columns: [] }),
  footer: z
    .object({
      showFooterText: z.boolean().default(true),
      showDisclaimer: z.boolean().default(true),
      showPaymentDetails: z.boolean().default(true),
      showSignature: z.boolean().default(false),
      showStamp: z.boolean().default(false),
    })
    .default({
      showFooterText: true,
      showDisclaimer: true,
      showPaymentDetails: true,
      showSignature: false,
      showStamp: false,
    }),
  labels: z
    .object({
      documentTitle: z.string().optional(),
      documentNumber: z.string().default("Document #"),
      documentDate: z.string().default("Date"),
      customer: z.string().default("Customer"),
    })
    .default({
      documentNumber: "Document #",
      documentDate: "Date",
      customer: "Customer",
    }),
  rows: z.array(templateRowSchema).max(40).default([]),
  payslip: payslipShowSchema.default({ statutory: true, otherDeductions: true, penalties: true, hideZero: true }),
});

export type DocumentTemplateSchema = z.infer<typeof templateSchema>;

export const defaultTemplateSchema: DocumentTemplateSchema = templateSchema.parse({});

export function parseTemplateSchema(value: string | null | undefined): DocumentTemplateSchema {
  if (!value) return defaultTemplateSchema;
  try {
    return templateSchema.parse(JSON.parse(value));
  } catch {
    return defaultTemplateSchema;
  }
}
