import type { DocumentType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { resolveTemplate } from "@/lib/documents/template-resolver";
import { templateSchema, type DocumentTemplateSchema } from "@/lib/documents/template-schema";
import { CRM_DOCUMENT_SOURCE_KEYS } from "@/lib/crm/document-sources";
import { libraryLayoutById } from "@/lib/library/workspace";
import { libraryFor } from "@/lib/library/reach";
import { layoutPayloadSchema } from "@/lib/library/build-kinds";

/**
 * The layouts a CRM quote, invoice or receipt can print in: the company's own,
 * those Corelith's library publishes to it, and the system's, for exactly this
 * kind of document (a school's fee invoice layout is not offered for a CRM
 * invoice), with the default first: the company's, else the library's newest,
 * else the system's.
 * A layout decides what shows and how the page is set; colours, fonts, logo
 * and footer words come from the company's branding.
 */

export type CrmDocumentKind = keyof typeof CRM_DOCUMENT_SOURCE_KEYS;

const DOCUMENT_TYPES: Record<CrmDocumentKind, DocumentType> = {
  QUOTATION: "SALES_QUOTATION",
  INVOICE: "SALES_INVOICE",
  RECEIPT: "SALES_RECEIPT",
};

/** Who may make and change layouts, as in Preferences → Templates. */
export function canCustomiseLayouts(role: string | null | undefined): boolean {
  return role === "SUPERADMIN" || role === "MANAGER";
}

export type LayoutChoice = { id: string; name: string; description: string | null; isDefault: boolean; own: boolean };

export async function layoutsFor(companyId: string, kind: CrmDocumentKind): Promise<LayoutChoice[]> {
  const [rows, published] = await Promise.all([
    prisma.documentTemplate.findMany({
      where: {
        OR: [{ companyId }, { scope: "SYSTEM", companyId: null }],
        sourceKey: CRM_DOCUMENT_SOURCE_KEYS[kind],
        documentType: DOCUMENT_TYPES[kind],
        targetType: "RECORD",
        isActive: true,
      },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: { id: true, name: true, description: true, isDefault: true, companyId: true },
    }),
    libraryFor(companyId, "LAYOUT"),
  ]);
  // Newest first, as the resolver reads them: the first is the library's default.
  const library = published.filter((item) => isFor(kind, layoutPayloadSchema.safeParse(item.payload).data));
  // A company default outranks the library's, and the library's the system's.
  const companyDefault = rows.some((row) => row.companyId && row.isDefault);
  const choices: LayoutChoice[] = [
    ...rows
      .filter((row) => row.companyId)
      .map((row) => ({ id: row.id, name: row.name, description: row.description, isDefault: row.isDefault, own: true })),
    ...library.map((item, at) => ({ id: item.id, name: item.title, description: item.summary, isDefault: !companyDefault && at === 0, own: false })),
    ...rows
      .filter((row) => !row.companyId)
      .map((row) => ({ id: row.id, name: row.name, description: row.description, isDefault: row.isDefault && !companyDefault && library.length === 0, own: false })),
  ];
  return choices.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

/** Whether a library layout's payload prints exactly this kind of CRM document. */
function isFor(kind: CrmDocumentKind, payload: { sourceKey: string; documentType: string; targetType: string } | undefined): boolean {
  return Boolean(payload && payload.sourceKey === CRM_DOCUMENT_SOURCE_KEYS[kind] && payload.documentType === DOCUMENT_TYPES[kind] && payload.targetType === "RECORD");
}

/** The settings a layout prints with; no id is the company default. */
export async function layoutSchema(companyId: string, kind: CrmDocumentKind, templateId?: string | null): Promise<DocumentTemplateSchema> {
  const resolved = await resolveTemplate({
    companyId,
    documentType: DOCUMENT_TYPES[kind],
    targetType: "RECORD",
    sourceKey: CRM_DOCUMENT_SOURCE_KEYS[kind],
    templateId: templateId ?? undefined,
  });
  return resolved.templateSchema;
}

/** Whether a layout may be chosen for this kind of document in this company. */
export async function isLayoutFor(companyId: string, kind: CrmDocumentKind, templateId: string): Promise<boolean> {
  const found = await prisma.documentTemplate.findFirst({
    where: {
      id: templateId,
      OR: [{ companyId }, { scope: "SYSTEM", companyId: null }],
      sourceKey: CRM_DOCUMENT_SOURCE_KEYS[kind],
      documentType: DOCUMENT_TYPES[kind],
      isActive: true,
    },
    select: { id: true },
  });
  if (found) return true;
  return isFor(kind, (await libraryLayoutById(companyId, templateId))?.payload);
}

/**
 * A layout made from the builder: the company's own, its first version
 * published at once, so the document it was made on prints in it straight
 * away and the next document can be given it too.
 */
export async function createCompanyLayout(input: {
  companyId: string;
  userId: string;
  kind: CrmDocumentKind;
  name: string;
  schema: DocumentTemplateSchema;
}): Promise<LayoutChoice> {
  const schema = templateSchema.parse(input.schema);
  const template = await prisma.$transaction(async (tx) => {
    const created = await tx.documentTemplate.create({
      data: {
        companyId: input.companyId,
        scope: "COMPANY",
        name: input.name,
        sourceKey: CRM_DOCUMENT_SOURCE_KEYS[input.kind],
        documentType: DOCUMENT_TYPES[input.kind],
        targetType: "RECORD",
        isDefault: false,
        isActive: true,
        createdById: input.userId,
        updatedById: input.userId,
      },
      select: { id: true, name: true, description: true },
    });
    await tx.documentTemplateVersion.create({
      data: {
        templateId: created.id,
        version: 1,
        schemaJson: JSON.stringify(schema),
        isPublished: true,
        publishedAt: new Date(),
        publishedById: input.userId,
        createdById: input.userId,
      },
    });
    return created;
  });
  return { ...template, isDefault: false, own: true };
}
