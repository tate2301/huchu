import { z } from "zod";

const alignSchema = z.enum(["left", "center", "right"]);

export const templateColumnSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  width: z.string().optional(),
  align: alignSchema.optional(),
  mono: z.boolean().optional(),
});

export const templateSchema = z.object({
  page: z
    .object({
      size: z.enum(["A4", "LETTER"]).default("A4"),
      orientation: z.enum(["portrait", "landscape"]).default("portrait"),
      marginMm: z.number().min(5).max(40).default(10),
    })
    .default({ size: "A4", orientation: "portrait", marginMm: 10 }),
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
