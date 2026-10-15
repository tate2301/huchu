import { Prisma, type PrismaClient } from "@prisma/client";

import { passages, type ReadKnowledge } from "./read";

/**
 * The CRM's knowledge base (CRM → Knowledge): the documents a workspace
 * uploaded, their passages and their prices, and the search Vane uses to
 * answer and quote from them. Prices a person has kept are the ones Vane
 * quotes from; prices Vane found in prose wait for someone to keep them.
 */

type Db = Pick<PrismaClient, "crmKnowledgeDoc" | "crmKnowledgeChunk" | "crmKnowledgePrice" | "$transaction" | "$queryRaw">;

export type KnowledgeFile = { title: string; fileName: string; contentType: string; size: number; url: string; pathname: string | null };

/** Files a read document: its words in passages, a spreadsheet's prices kept as they stand. */
export async function addKnowledgeDoc(db: Db, who: { companyId: string; userId: string | null }, file: KnowledgeFile, read: ReadKnowledge) {
  return db.$transaction(async (tx) => {
    const doc = await tx.crmKnowledgeDoc.create({
      data: {
        companyId: who.companyId,
        uploadedById: who.userId,
        title: file.title,
        kind: read.kind,
        fileName: file.fileName,
        contentType: file.contentType,
        size: file.size,
        url: file.url,
        pathname: file.pathname,
        text: read.text,
        pages: read.pages,
      },
      select: { id: true, title: true, kind: true },
    });
    await tx.crmKnowledgeChunk.createMany({
      data: passages(read.text).map((text, position) => ({ companyId: who.companyId, docId: doc.id, position, text })),
    });
    if (read.prices.length) {
      await tx.crmKnowledgePrice.createMany({
        data: read.prices.map((price, position) => ({ companyId: who.companyId, docId: doc.id, position, ...price, unitPrice: new Prisma.Decimal(price.unitPrice), kept: true })),
      });
    }
    return { ...doc, prices: read.prices.length };
  });
}

export type KnowledgeRow = {
  id: string;
  title: string;
  kind: "PRICE_LIST" | "DOCUMENT";
  fileName: string;
  pages: number | null;
  prices: number;
  /** Prices Vane found that nobody has kept yet. */
  waiting: number;
  uploadedBy: string | null;
  createdAt: string;
};

export async function listKnowledge(db: Pick<PrismaClient, "crmKnowledgeDoc" | "crmKnowledgePrice">, companyId: string): Promise<KnowledgeRow[]> {
  const [docs, counts] = await Promise.all([
    db.crmKnowledgeDoc.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, kind: true, fileName: true, pages: true, createdAt: true, uploadedBy: { select: { name: true } } },
    }),
    db.crmKnowledgePrice.groupBy({ by: ["docId", "kept"], where: { companyId }, _count: { _all: true } }),
  ]);
  const count = (docId: string, kept: boolean) => counts.find((row) => row.docId === docId && row.kept === kept)?._count._all ?? 0;
  return docs.map((doc) => ({
    id: doc.id,
    title: doc.title,
    kind: doc.kind,
    fileName: doc.fileName,
    pages: doc.pages,
    prices: count(doc.id, true),
    waiting: count(doc.id, false),
    uploadedBy: doc.uploadedBy?.name ?? null,
    createdAt: doc.createdAt.toISOString(),
  }));
}

export type KnowledgePriceView = {
  id: string;
  name: string;
  description: string | null;
  code: string | null;
  unit: string | null;
  unitPrice: number;
  currency: string;
  source: string;
  kept: boolean;
};

export type KnowledgeDocView = {
  id: string;
  title: string;
  kind: "PRICE_LIST" | "DOCUMENT";
  fileName: string;
  url: string;
  pages: number | null;
  uploadedBy: string | null;
  createdAt: string;
  pricesFoundAt: string | null;
  text: string;
  prices: KnowledgePriceView[];
  /** Quotes priced from this document, newest first. */
  quotedIn: number;
};

const toPrice = (price: { id: string; name: string; description: string | null; code: string | null; unit: string | null; unitPrice: Prisma.Decimal; currency: string; source: string; kept: boolean }): KnowledgePriceView => ({
  ...price,
  unitPrice: Number(price.unitPrice),
});

export async function readKnowledgeDoc(db: Pick<PrismaClient, "crmKnowledgeDoc" | "salesQuotationLine">, companyId: string, id: string): Promise<KnowledgeDocView | null> {
  const doc = await db.crmKnowledgeDoc.findFirst({
    where: { id, companyId },
    select: {
      id: true,
      title: true,
      kind: true,
      fileName: true,
      url: true,
      pages: true,
      createdAt: true,
      pricesFoundAt: true,
      text: true,
      uploadedBy: { select: { name: true } },
      prices: {
        orderBy: { position: "asc" },
        select: { id: true, name: true, description: true, code: true, unit: true, unitPrice: true, currency: true, source: true, kept: true },
      },
    },
  });
  if (!doc) return null;
  const quotedIn = await db.salesQuotationLine.findMany({
    where: { knowledgePrice: { docId: id, companyId } },
    distinct: ["quotationId"],
    select: { quotationId: true },
  });
  return {
    id: doc.id,
    title: doc.title,
    kind: doc.kind,
    fileName: doc.fileName,
    url: doc.url,
    pages: doc.pages,
    uploadedBy: doc.uploadedBy?.name ?? null,
    createdAt: doc.createdAt.toISOString(),
    pricesFoundAt: doc.pricesFoundAt?.toISOString() ?? null,
    text: doc.text,
    prices: doc.prices.map(toPrice),
    quotedIn: quotedIn.length,
  };
}

/** Keeps prices Vane found, or lets them go. Kept prices stay; a price already kept is not removed here. */
export async function decidePrices(db: Pick<PrismaClient, "crmKnowledgePrice">, companyId: string, docId: string, ids: string[], keep: boolean) {
  const where = { companyId, docId, id: { in: ids }, kept: false };
  const { count } = keep ? await db.crmKnowledgePrice.updateMany({ where, data: { kept: true } }) : await db.crmKnowledgePrice.deleteMany({ where });
  return count;
}

/** Removes one price, kept or not, from a document: a wrong spreadsheet row. Quotes priced from it keep their lines. */
export async function removePrice(db: Pick<PrismaClient, "crmKnowledgePrice">, companyId: string, docId: string, id: string) {
  const { count } = await db.crmKnowledgePrice.deleteMany({ where: { companyId, docId, id } });
  return count;
}

export type KnowledgeHit = {
  passages: Array<{ docId: string; title: string; position: number; text: string }>;
  prices: Array<{ id: string; docId: string; title: string; name: string; description: string | null; code: string | null; unit: string | null; unitPrice: number; currency: string; source: string }>;
};

/**
 * Finds what the knowledge base says about a question: the passages and the
 * kept prices that match it best, by Postgres full-text search (any of the
 * words, best first). A price whose name holds the whole question comes first
 * however it ranks.
 */
export async function searchKnowledge(db: Pick<PrismaClient, "$queryRaw">, companyId: string, query: string, limit = 8): Promise<KnowledgeHit> {
  const words = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1)
    .slice(0, 12);
  if (words.length === 0) return { passages: [], prices: [] };
  const any = words.join(" OR ");
  const like = `%${query.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const [passageRows, priceRows] = await Promise.all([
    db.$queryRaw<Array<{ docId: string; title: string; position: number; text: string }>>`
      SELECT c."docId", d."title", c."position", c."text"
      FROM "CrmKnowledgeChunk" c JOIN "CrmKnowledgeDoc" d ON d."id" = c."docId"
      WHERE c."companyId" = ${companyId} AND c."search" @@ websearch_to_tsquery('english', ${any})
      ORDER BY ts_rank(c."search", websearch_to_tsquery('english', ${any})) DESC, c."position"
      LIMIT ${limit}`,
    db.$queryRaw<Array<KnowledgeHit["prices"][number] & { unitPrice: Prisma.Decimal }>>`
      SELECT p."id", p."docId", d."title", p."name", p."description", p."code", p."unit", p."unitPrice", p."currency", p."source"
      FROM "CrmKnowledgePrice" p JOIN "CrmKnowledgeDoc" d ON d."id" = p."docId"
      WHERE p."companyId" = ${companyId} AND p."kept"
        AND (p."search" @@ websearch_to_tsquery('english', ${any}) OR p."name" ILIKE ${like})
      ORDER BY (p."name" ILIKE ${like}) DESC, ts_rank(p."search", websearch_to_tsquery('english', ${any})) DESC, p."name"
      LIMIT ${limit * 3}`,
  ]);
  return {
    passages: passageRows.map((row) => ({ ...row, position: Number(row.position) })),
    prices: priceRows.map((row) => ({ ...row, unitPrice: Number(row.unitPrice) })),
  };
}
