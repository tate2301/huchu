import { randomBytes, randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { createQuestionSetFrom } from "@/lib/crm/site-visits/builder-templates";
import { prisma } from "@/lib/prisma";

import { workspaceLibraryItemOf } from "./workspace";

/**
 * A workspace's own copy of one of Corelith's library: made through the same
 * tables the type's builder writes, named so nothing of its kind here clashes,
 * and started as a draft its maker finishes and publishes (a layout, like the
 * catalogue's, is ready to print with but is not made the default). Each
 * returns null when the item does not reach the workspace.
 *
 * Once copied it is the workspace's: changing or retiring the library item
 * changes nothing here.
 */

/** "Quotation", then "Quotation 2": a name nothing of the same kind here has. */
export function freeCopyName(wanted: string, taken: readonly string[]): string {
  const names = new Set(taken.map((name) => name.trim().toLowerCase()));
  if (!names.has(wanted.trim().toLowerCase())) return wanted;
  for (let n = 2; ; n += 1) {
    const next = `${wanted} ${n}`;
    if (!names.has(next.toLowerCase())) return next;
  }
}

export async function copyLibraryVisitForm(companyId: string, userId: string, key: string) {
  const found = await workspaceLibraryItemOf(companyId, "VISIT_FORM", key);
  if (!found) return null;
  const { entry } = found;
  return prisma.$transaction((tx) =>
    createQuestionSetFrom(tx, companyId, userId, {
      key: entry.key,
      name: entry.title,
      description: entry.summary ?? "",
      kind: entry.payload.kind,
      group: "measured",
      fields: entry.payload.fields,
      quoteLines: entry.payload.quoteLines,
    }),
  );
}

export async function copyLibraryEnquiryForm(companyId: string, userId: string, key: string) {
  const found = await workspaceLibraryItemOf(companyId, "ENQUIRY_FORM", key);
  if (!found) return null;
  const { entry } = found;
  const taken = await prisma.crmIntakeForm.findMany({ where: { companyId, name: { startsWith: entry.title } }, select: { name: true } });
  return prisma.crmIntakeForm.create({
    data: {
      companyId,
      name: freeCopyName(entry.title, taken.map((row) => row.name)),
      publicToken: randomBytes(9).toString("base64url"),
      headline: entry.payload.headline || null,
      description: entry.payload.description || null,
      successMessage: entry.payload.successMessage || null,
      allowPhotos: entry.payload.allowPhotos,
      maxPhotos: entry.payload.maxPhotos,
      fields: entry.payload.fields,
      services: entry.payload.services,
      // Paused until it is published from the builder: the link says so.
      isActive: false,
      createdById: userId,
    },
    select: { id: true, name: true },
  });
}

export async function copyLibraryBlockTemplate(companyId: string, userId: string, key: string) {
  const found = await workspaceLibraryItemOf(companyId, "BLOCK_TEMPLATE", key);
  if (!found) return null;
  const { entry } = found;
  const { kind, attributes, blocks } = entry.payload;
  const taken = await prisma.crmTemplate.findMany({ where: { companyId, kind, name: { startsWith: entry.title } }, select: { name: true } });
  return prisma.crmTemplate.create({
    data: {
      companyId,
      name: freeCopyName(entry.title, taken.map((row) => row.name)),
      kind,
      attributes: attributes as unknown as Prisma.InputJsonValue,
      blocks: blocks as unknown as Prisma.InputJsonValue,
      // A draft until it is published from the builder, as one made from a starter is.
      isShared: false,
      isActive: true,
      publicToken: kind === "FORM" ? randomUUID() : null,
      createdById: userId,
    },
    select: { id: true, name: true, kind: true },
  });
}

export async function copyLibraryLayout(companyId: string, userId: string, key: string) {
  const found = await workspaceLibraryItemOf(companyId, "LAYOUT", key);
  if (!found) return null;
  const { entry } = found;
  const { sourceKey, documentType, targetType, schema } = entry.payload;
  const taken = await prisma.documentTemplate.findMany({ where: { companyId, sourceKey, name: { startsWith: entry.title } }, select: { name: true } });
  return prisma.$transaction(async (tx) => {
    const template = await tx.documentTemplate.create({
      data: {
        companyId,
        scope: "COMPANY",
        name: freeCopyName(entry.title, taken.map((row) => row.name)),
        description: entry.summary,
        sourceKey,
        documentType,
        targetType,
        isDefault: false,
        isActive: true,
        createdById: userId,
        updatedById: userId,
      },
    });
    const version = await tx.documentTemplateVersion.create({
      data: {
        templateId: template.id,
        version: 1,
        schemaJson: JSON.stringify(schema),
        isPublished: true,
        publishedAt: new Date(),
        publishedById: userId,
        createdById: userId,
      },
    });
    return { template, version };
  });
}
