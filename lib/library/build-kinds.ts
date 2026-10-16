import { z } from "zod";

import { blockSchema, templateAttributesSchema, templateProblems, TEMPLATE_KINDS } from "@/lib/crm/blocks";
import { crmIntakeFieldsSchema, crmIntakeServicesSchema } from "@/lib/crm/intake-schema";
import { SITE_VISIT_FIELD_TYPES } from "@/lib/crm/site-visits/fields";
import { DEFAULT_TEMPLATE_CATALOG, type DefaultTemplateCatalogEntry } from "@/lib/documents/default-template-catalog";
import { templateSchema as layoutSchema } from "@/lib/documents/template-schema";
import { FIELD_TYPE_LABELS, fieldListSchema, fieldProblems } from "@/lib/forms/fields";
import { quoteLineProblems, quoteLineSchema } from "@/lib/forms/quote";

/**
 * The payloads of the library's forms, templates and layouts: what each
 * kind's builder reads and writes, less what only a workspace has (its
 * products, its public links, who may see a draft). A workspace's copy is
 * made from one of these through the kind's own create path.
 */

const problemsInto = (ctx: z.RefinementCtx, problems: readonly string[]) => {
  for (const message of problems) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
};

/** A quote line sells by description and price: a workspace links its own products after copying. */
export const libraryQuoteLineSchema = quoteLineSchema.omit({ productId: true });

export const visitFormPayloadSchema = z
  .object({
    /** When it is asked: when quoting, on every visit, or at the end of every visit. */
    kind: z.enum(["PRODUCT", "EVIDENCE", "CLOSEOUT"]),
    fields: fieldListSchema,
    /** The quote its measurements draft. */
    quoteLines: z.array(libraryQuoteLineSchema).max(60).default([]),
  })
  .superRefine((payload, ctx) => {
    const kept = new Set(SITE_VISIT_FIELD_TYPES);
    problemsInto(
      ctx,
      payload.fields.filter((field) => !kept.has(field.type)).map((field) => `A site-visit form cannot ask a ${FIELD_TYPE_LABELS[field.type].toLowerCase()} question.`),
    );
    problemsInto(ctx, [...fieldProblems(payload.fields), ...quoteLineProblems(payload.quoteLines, payload.fields)]);
  });

export type VisitFormPayload = z.infer<typeof visitFormPayloadSchema>;

export const enquiryFormPayloadSchema = z
  .object({
    /** The title the customer sees; the item's title when there is none. */
    headline: z.string().trim().max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    successMessage: z.string().trim().max(500).optional(),
    allowPhotos: z.boolean().default(true),
    maxPhotos: z.number().int().min(0).max(20).default(5),
    fields: crmIntakeFieldsSchema,
    services: crmIntakeServicesSchema,
  })
  .superRefine((payload, ctx) => {
    const ids = payload.services.map((service) => service.id);
    if (new Set(ids).size !== ids.length) problemsInto(ctx, ["Two services have the same id."]);
    problemsInto(ctx, fieldProblems(payload.fields));
  });

export type EnquiryFormPayload = z.infer<typeof enquiryFormPayloadSchema>;

export const blockTemplatePayloadSchema = z
  .object({
    kind: z.enum(TEMPLATE_KINDS),
    attributes: templateAttributesSchema.default({ custom: {} }),
    blocks: z.array(blockSchema).max(200).default([]),
  })
  .superRefine((payload, ctx) => problemsInto(ctx, templateProblems(payload.kind, payload.blocks)));

export type BlockTemplatePayload = z.infer<typeof blockTemplatePayloadSchema>;

/** The catalogue entry a layout prints for: its source, document type and target together. */
export function layoutSourceOf(payload: Pick<DefaultTemplateCatalogEntry, "sourceKey" | "documentType" | "targetType">): DefaultTemplateCatalogEntry | null {
  return (
    DEFAULT_TEMPLATE_CATALOG.find(
      (entry) => entry.sourceKey === payload.sourceKey && entry.documentType === payload.documentType && entry.targetType === payload.targetType,
    ) ?? null
  );
}

export const layoutPayloadSchema = z
  .object({
    documentType: z.enum(["REPORT_TABLE", "DASHBOARD_PACK", "SALES_INVOICE", "SALES_QUOTATION", "SALES_RECEIPT", "GENERIC_RECORD"]),
    targetType: z.enum(["LIST", "RECORD", "DASHBOARD"]),
    /** The list or record it prints ("accounting.sales.invoice"): one of the catalogue's. */
    sourceKey: z.string().trim().min(1).max(120),
    schema: layoutSchema,
  })
  .refine((payload) => layoutSourceOf(payload) !== null, { message: "Choose what it prints", path: ["sourceKey"] });

export type LayoutPayload = z.infer<typeof layoutPayloadSchema>;

const INVOICE = DEFAULT_TEMPLATE_CATALOG.find((entry) => entry.sourceKey === "accounting.sales.invoice")!;

export const EMPTY_VISIT_FORM: VisitFormPayload = { kind: "PRODUCT", fields: [], quoteLines: [] };
export const EMPTY_ENQUIRY_FORM: EnquiryFormPayload = { allowPhotos: true, maxPhotos: 5, fields: [], services: [] };
export const EMPTY_BLOCK_TEMPLATE: BlockTemplatePayload = { kind: "QUOTE", attributes: { custom: {} }, blocks: [] };
export const EMPTY_LAYOUT: LayoutPayload = {
  documentType: INVOICE.documentType,
  targetType: INVOICE.targetType,
  sourceKey: INVOICE.sourceKey,
  schema: INVOICE.schema,
};
