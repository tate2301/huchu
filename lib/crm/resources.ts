/**
 * What the client is asked to look at alongside a quote or an invoice.
 *
 * A quote is rarely read on its own. The brochure that says what the brand
 * is, the data sheet for the resin, the terms of the guarantee — a rep used to
 * attach those by hand to a separate email, or forget to. Now the tenant keeps
 * them as a library (settings, "Client resources"), marks the ones that go
 * with everything as defaults, and each document records which it offered.
 * The approval page, the covering email and the PDF all list them from that
 * record, so the three cannot disagree.
 *
 * The library is data: what Floorcode sends is rows, never a branch in here.
 */
import type { Prisma } from "@prisma/client";
import { z } from "zod";

type Tx = Prisma.TransactionClient;

export type ResourceKind = "LINK" | "FILE";

/** A library entry, as the settings screen and the document builder read it. */
export type LibraryResource = {
  id: string;
  title: string;
  description: string | null;
  kind: ResourceKind;
  url: string;
  isDefault: boolean;
  archivedAt: string | Date | null;
  sortOrder: number;
};

/** What a client is shown for one resource. */
export type ResourceLink = {
  title: string;
  description: string | null;
  url: string;
};

/** The order the library is listed in, and the order a document prints them in. */
export function sortResources<T extends { sortOrder: number; title: string }>(resources: T[]): T[] {
  return [...resources].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title),
  );
}

/**
 * Which resources a document starts with ticked.
 *
 * A new document gets the tenant's defaults — the things that go with every
 * quote. A revision gets what the version it replaces offered, because the
 * client has already been sent those and a second version quietly dropping
 * the data sheet reads as the business withdrawing it. Either way only what is
 * still in the library can be offered: an archived resource is retired from
 * new documents, including new versions of old ones.
 */
export function preselectedResourceIds(
  library: LibraryResource[],
  previous?: string[] | null,
): string[] {
  const live = sortResources(library.filter((resource) => !resource.archivedAt));
  if (previous) {
    const offered = new Set(previous);
    return live.filter((resource) => offered.has(resource.id)).map((resource) => resource.id);
  }
  return live.filter((resource) => resource.isDefault).map((resource) => resource.id);
}

/**
 * A document's resources as the client sees them, in library order.
 *
 * Archived entries are still shown: archiving retires a resource from new
 * documents, it does not reach into one already sent and take a link back.
 */
export function documentResourceLinks(
  rows: Array<{
    resource: { title: string; description: string | null; url: string; sortOrder: number };
  }>,
): ResourceLink[] {
  return sortResources(rows.map((row) => row.resource)).map((resource) => ({
    title: resource.title,
    description: resource.description?.trim() || null,
    url: resource.url,
  }));
}

/**
 * The heading the list sits under.
 *
 * A quote is something the client accepts, so the materials are what to read
 * first. An invoice is already agreed; the same links are there for reference.
 */
export function resourcesHeading(documentType: "QUOTATION" | "INVOICE" | "RECEIPT"): string {
  return documentType === "QUOTATION" ? "Review before you accept" : "For your reference";
}

/** The shape every document-carrying query selects, so each surface reads the same fields. */
export const DOCUMENT_RESOURCES_SELECT = {
  select: {
    resource: { select: { title: true, description: true, url: true, sortOrder: true } },
  },
} satisfies Prisma.CrmDocumentResourceFindManyArgs;

const title = z.string().trim().min(1, "Give it a title").max(160);
const description = z.string().trim().max(300).nullable().optional();
const webUrl = z
  .string()
  .trim()
  .max(2000)
  .url("That is not a web address")
  .refine((value) => /^https?:\/\//i.test(value), "The link has to start with http:// or https://");

export const createResourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("LINK"),
    title,
    description,
    url: webUrl,
    isDefault: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal("FILE"),
    title,
    description,
    // What the upload route handed back for the file.
    url: webUrl,
    pathname: z.string().trim().min(1).max(500),
    contentType: z.string().trim().min(1).max(120),
    isDefault: z.boolean().optional(),
  }),
]);

export type CreateResourceInput = z.infer<typeof createResourceSchema>;

export const updateResourceSchema = z.object({
  title: title.optional(),
  description,
  /** Only a link's address can change; a file is replaced by uploading another. */
  url: webUrl.optional(),
  isDefault: z.boolean().optional(),
  archived: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

export type UpdateResourceInput = z.infer<typeof updateResourceSchema>;

export const documentResourceIdsSchema = z.array(z.string().uuid()).max(30);

export class ResourceNotAvailableError extends Error {
  constructor() {
    super("One of the resources for the client is no longer in the library. Reload and choose again.");
    this.name = "ResourceNotAvailableError";
  }
}

/**
 * Record which resources a document offered, replacing whatever it offered
 * before.
 *
 * An id from another tenant, or one that has been archived, is refused rather
 * than skipped: the rep ticked it, and silently sending the quote without it
 * would leave them believing the client has the brochure.
 */
export async function setDocumentResources(
  tx: Tx,
  input: { companyId: string; documentId: string; resourceIds: string[] },
): Promise<void> {
  const ids = [...new Set(input.resourceIds)];

  if (ids.length > 0) {
    const found = await tx.crmResource.count({
      where: { id: { in: ids }, companyId: input.companyId, archivedAt: null },
    });
    if (found !== ids.length) throw new ResourceNotAvailableError();
  }

  await tx.crmDocumentResource.deleteMany({
    where: { companyId: input.companyId, documentId: input.documentId },
  });
  if (ids.length > 0) {
    await tx.crmDocumentResource.createMany({
      data: ids.map((resourceId) => ({
        companyId: input.companyId,
        documentId: input.documentId,
        resourceId,
      })),
    });
  }
}
