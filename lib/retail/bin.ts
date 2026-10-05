import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { BIN_KEEP_DAYS, restorableUntil } from "@/lib/retail/asks";
import { auditRecordBin, auditRecordPurged, RETAIL_AUDIT_EVENTS, type RetailAuditActor } from "@/lib/retail/audit";
import { categoryBinRefusal, restoreCategory } from "@/lib/retail/categories";
import type { RetailAction, RetailResource } from "@/lib/retail/permission-matrix";
import { archiveShelfListing, restoreShelfListing } from "@/lib/retail/shelf-listing";

/**
 * The shop's bin: what was removed, and the way back (W-63, 00-foundations 4.6,
 * 80-admin 4.5).
 *
 * Nothing a shop removes is deleted at once. A product has sale lines pointing
 * at it, a promotion has receipts that name it, a category has products filed
 * under it; each goes in the bin instead — `archivedAt` set, off every list,
 * lookup and the till — and can be restored for 30 days by whoever holds Bin
 * update. Then it is gone for good: by the owner's "Delete for good", or by
 * the nightly purge. Gone for good is a `RETAIL_RECORD.PURGED` event, plus
 * deleting the row when nothing refers to it; a row something refers to is
 * kept, under its name, and never listed or restored again.
 *
 * Each binnable kind registers here once: its entity type (the one its audit
 * events and Activity use), the rights that bin and open it, how to find and
 * list it, and its own move, restore and purge, which run inside the bin's
 * transaction beside the event. Area specs add their kinds to `BIN_KINDS` and
 * `KINDS`.
 */

export const BIN_KINDS = ["product", "promotion", "category"] as const;
export type BinKind = (typeof BIN_KINDS)[number];

type Tx = Prisma.TransactionClient;

type Found = { name: string; archivedAt: Date | null };

/** A record in the bin, as its kind lists it. */
export type Binned = { companyId: string; id: string; name: string; reference: string | null; binnedAt: Date };

/** Which binned records a kind lists: one company's or every company's, binned in a window. */
export type BinnedWhere = { companyId?: string; from?: Date; before?: Date };

export type BinKindSpec = {
  kind: BinKind;
  /** "Product": what the bin list calls it, and the Kind filter's option. */
  label: string;
  /** A row's own label when it says more ("Customer, merged"). */
  labelFor?: (row: Binned) => string;
  /** The entity type its audit events are written under. */
  entityType: string;
  /** Moving one to the bin is this right (the record's D on the Roles board). */
  deleteRight: [RetailResource, RetailAction];
  /** Opening it is this right; the bin's "Open it" is drawn only with it. */
  viewRight: [RetailResource, RetailAction];
  /** The row key the bin list's "Open it" link reads (the record's page). Absent: no record page. */
  openKey?: string;
  /**
   * The events that put one in the bin, whose actor is "Binned by":
   * `RETAIL_RECORD.BINNED`, and a kind's own when its delete bins it
   * (a category deleted from Products › Categories).
   */
  binEvents: string[];
  find(tx: Tx, companyId: string, id: string): Promise<Found | null>;
  /** Into the bin. A sentence refuses it (409), passed through as it is. */
  move(tx: Tx, companyId: string, id: string, at: Date): Promise<string | null>;
  /** Out of the bin. A sentence refuses it (409), passed through as it is. */
  restore(tx: Tx, companyId: string, id: string): Promise<string | null>;
  /**
   * Gone for good: the row is deleted when nothing sold, paid or counted
   * refers to it; otherwise it is kept, under its name, for that history.
   */
  purge(tx: Tx, companyId: string, id: string): Promise<"deleted" | "kept">;
  /** Its records in the bin (`archivedAt` set), in a window of when they went in. */
  listBinned(where: BinnedWhere): Promise<Binned[]>;
};

/** `archivedAt` in a window, for one company or all. */
function binnedWhere(where: BinnedWhere) {
  return {
    ...(where.companyId ? { companyId: where.companyId } : {}),
    archivedAt: { not: null, ...(where.from ? { gte: where.from } : {}), ...(where.before ? { lt: where.before } : {}) },
  };
}

const KINDS: Record<BinKind, BinKindSpec> = {
  product: {
    kind: "product",
    label: "Product",
    entityType: "Product",
    deleteRight: ["retail.catalog", "delete"],
    viewRight: ["retail.catalog", "view"],
    openKey: "productId",
    binEvents: [RETAIL_AUDIT_EVENTS.recordBinned],
    find: (tx, companyId, id) =>
      tx.product.findFirst({ where: { id, companyId }, select: { name: true, archivedAt: true } }),
    // The till reads the shelf price; the line leaves the till with it.
    move: async (tx, companyId, id, at) => {
      await archiveShelfListing(tx, { companyId, productId: id, at });
      return null;
    },
    restore: async (tx, companyId, id) => {
      await restoreShelfListing(tx, { companyId, productId: id });
      return null;
    },
    // Its stock lines go with it, unless anything happened on them: a sale,
    // a movement, an order or a delivery, or stock still on the shelf.
    purge: async (tx, companyId, id) => {
      const items = await tx.inventoryItem.findMany({
        where: { productId: id, site: { companyId } },
        select: {
          id: true,
          currentStock: true,
          _count: { select: { movements: true, retailSaleLines: true, retailPurchaseOrderLines: true, retailGoodsReceiptLines: true } },
        },
      });
      const [sold, crmSets, crmSections, crmWork] = await Promise.all([
        tx.retailSaleLine.count({ where: { companyId, productId: id } }),
        tx.crmQuestionSet.count({ where: { productId: id } }),
        tx.crmSiteVisitSection.count({ where: { productId: id } }),
        tx.crmWorkOrderItem.count({ where: { productId: id } }),
      ]);
      const used = items.some(
        (item) =>
          !item.currentStock.isZero() ||
          item._count.movements + item._count.retailSaleLines + item._count.retailPurchaseOrderLines + item._count.retailGoodsReceiptLines > 0,
      );
      if (used || sold + crmSets + crmSections + crmWork > 0) return "kept";
      await tx.inventoryItem.deleteMany({ where: { id: { in: items.map((item) => item.id) } } });
      // Its prices go with it (cascade); a case that opened into it keeps its own row.
      await tx.product.delete({ where: { id } });
      return "deleted";
    },
    listBinned: async (where) =>
      (
        await prisma.product.findMany({
          where: binnedWhere(where),
          select: { companyId: true, id: true, name: true, code: true, archivedAt: true },
        })
      ).map((row) => ({ companyId: row.companyId, id: row.id, name: row.name, reference: row.code, binnedAt: row.archivedAt! })),
  },
  promotion: {
    kind: "promotion",
    label: "Promotion",
    entityType: "RetailPromotion",
    deleteRight: ["retail.promotions", "delete"],
    viewRight: ["retail.promotions", "view"],
    binEvents: [RETAIL_AUDIT_EVENTS.recordBinned],
    find: (tx, companyId, id) =>
      tx.retailPromotion.findFirst({ where: { id, companyId }, select: { name: true, archivedAt: true } }),
    // Off the till at once. Back as inactive: whether it should run again, and
    // when, is the owner's call.
    move: async (tx, _companyId, id, at) => {
      await tx.retailPromotion.update({ where: { id }, data: { archivedAt: at, status: "INACTIVE" } });
      return null;
    },
    restore: async (tx, _companyId, id) => {
      await tx.retailPromotion.update({ where: { id }, data: { archivedAt: null, status: "INACTIVE" } });
      return null;
    },
    // A sale names it by its code; one that never ran on a sale is deleted.
    purge: async (tx, companyId, id) => {
      const promotion = await tx.retailPromotion.findFirstOrThrow({ where: { id, companyId }, select: { promoCode: true } });
      const sold = await tx.retailSale.count({ where: { companyId, promotionCode: promotion.promoCode } });
      if (sold > 0) return "kept";
      await tx.retailPromotion.delete({ where: { id } });
      return "deleted";
    },
    listBinned: async (where) =>
      (
        await prisma.retailPromotion.findMany({
          where: binnedWhere(where),
          select: { companyId: true, id: true, name: true, promoCode: true, archivedAt: true },
        })
      ).map((row) => ({ companyId: row.companyId, id: row.id, name: row.name, reference: row.promoCode, binnedAt: row.archivedAt! })),
  },
  category: {
    kind: "category",
    label: "Category",
    entityType: "RetailCategory",
    deleteRight: ["retail.categories", "delete"],
    viewRight: ["retail.categories", "view"],
    binEvents: [RETAIL_AUDIT_EVENTS.recordBinned, RETAIL_AUDIT_EVENTS.categoryDeleted],
    find: (tx, companyId, id) =>
      tx.retailCategory.findFirst({ where: { id, companyId }, select: { name: true, archivedAt: true } }),
    // Only an empty one goes straight in: one with products is deleted from
    // Products › Categories, which moves them first (PRD-02). Back empty.
    move: async (tx, companyId, id, at) => {
      const refusal = await categoryBinRefusal(tx, companyId, id);
      if (refusal) return refusal;
      await tx.retailCategory.update({ where: { id }, data: { archivedAt: at } });
      return null;
    },
    // Back empty, unless a live category has taken its name since.
    restore: (tx, companyId, id) => restoreCategory(tx, companyId, id),
    // Kept while anything is filed under it (a binned product, a binned category).
    purge: async (tx, companyId, id) => {
      const [products, inside] = await Promise.all([
        tx.product.count({ where: { companyId, categoryId: id } }),
        tx.retailCategory.count({ where: { companyId, parentId: id } }),
      ]);
      if (products + inside > 0) return "kept";
      await tx.retailCategory.delete({ where: { id } });
      return "deleted";
    },
    listBinned: async (where) =>
      (
        await prisma.retailCategory.findMany({
          where: binnedWhere(where),
          select: { companyId: true, id: true, name: true, archivedAt: true },
        })
      ).map((row) => ({ companyId: row.companyId, id: row.id, name: row.name, reference: null, binnedAt: row.archivedAt! })),
  },
};

export function binKind(kind: BinKind): BinKindSpec {
  return KINDS[kind];
}

/** The bin kind whose records are written under this entity type, if any. */
export function binKindForEntity(entityType: string): BinKindSpec | null {
  return Object.values(KINDS).find((spec) => spec.entityType === entityType) ?? null;
}

export const binInput = z.object({ kind: z.enum(BIN_KINDS), id: z.string().uuid() });
export type BinInput = z.infer<typeof binInput>;

/** The bin list's Restore and Delete for good: 1 to 100 records at once. */
export const binItemsInput = z.object({ items: z.array(binInput).min(1).max(100) });

/** A refusal with the status and the sentence the record shows. */
export class BinRefusal extends Error {
  constructor(
    readonly status: 404 | 409 | 410,
    message: string,
  ) {
    super(message);
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One move or restore of a record at a time: two at once would both read it
 * out of (or in) the bin and both write their event. The second waits here,
 * then reads what the first committed and is refused.
 */
async function lockRecord(tx: Tx, spec: BinKindSpec, id: string): Promise<void> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`retail-bin:${spec.entityType}:${id}`}))::text`;
}

/** Whether something binned at `binnedAt` can still come back at `now`. */
export function stillRestorable(binnedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - binnedAt.getTime() <= BIN_KEEP_DAYS * DAY_MS;
}

/** The start of the bin's window at `now`: anything binned before it is past 30 days. */
export function binWindowStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - BIN_KEEP_DAYS * DAY_MS);
}

/**
 * Whether a binned record was deleted for good since it went in: a
 * `RETAIL_RECORD.PURGED` event at or after `archivedAt`. A record kept for its
 * history stays in its table with `archivedAt` set, and this is what says it
 * is gone from the bin.
 */
async function purgedSince(
  client: Pick<Tx, "platformAuditEvent">,
  companyId: string,
  entityType: string,
  entityId: string,
  archivedAt: Date,
): Promise<boolean> {
  const event = await client.platformAuditEvent.findFirst({
    where: {
      companyId,
      entityType,
      entityId,
      eventType: RETAIL_AUDIT_EVENTS.recordPurged,
      createdAt: { gte: archivedAt },
    },
    select: { id: true },
  });
  return event !== null;
}

/** Into the bin. Throws `BinRefusal` for 404, 409 and a kind's own refusal. */
export async function moveToBin(
  actor: RetailAuditActor,
  input: BinInput,
  now: Date = new Date(),
): Promise<{ binnedAt: string; keptUntil: string }> {
  const spec = KINDS[input.kind];
  return prisma.$transaction(async (tx) => {
    await lockRecord(tx, spec, input.id);
    const found = await spec.find(tx, actor.companyId, input.id);
    if (!found) throw new BinRefusal(404, "That is not this shop's");
    if (found.archivedAt) throw new BinRefusal(409, "It is already in the bin");
    const refusal = await spec.move(tx, actor.companyId, input.id, now);
    if (refusal) throw new BinRefusal(409, refusal);
    await auditRecordBin(tx, {
      actor,
      action: "binned",
      entityType: spec.entityType,
      entityId: input.id,
      kind: spec.kind,
      name: found.name,
    });
    return { binnedAt: now.toISOString(), keptUntil: restorableUntil(now).toISOString() };
  });
}

/**
 * Out of the bin. Throws `BinRefusal`: 404 when it is not in it, 410 once it
 * was deleted for good or after 30 days.
 */
export async function restoreFromBin(
  actor: RetailAuditActor,
  input: BinInput,
  now: Date = new Date(),
): Promise<{ restored: true }> {
  const spec = KINDS[input.kind];
  return prisma.$transaction(async (tx) => {
    await lockRecord(tx, spec, input.id);
    const found = await spec.find(tx, actor.companyId, input.id);
    if (!found?.archivedAt) throw new BinRefusal(404, "That is not in the bin");
    if (await purgedSince(tx, actor.companyId, spec.entityType, input.id, found.archivedAt)) {
      throw new BinRefusal(410, "It was deleted for good.");
    }
    if (!stillRestorable(found.archivedAt, now)) {
      throw new BinRefusal(410, "It has been in the bin more than 30 days");
    }
    const refusal = await spec.restore(tx, actor.companyId, input.id);
    if (refusal) throw new BinRefusal(409, refusal);
    await auditRecordBin(tx, {
      actor,
      action: "restored",
      entityType: spec.entityType,
      entityId: input.id,
      kind: spec.kind,
      name: found.name,
    });
    return { restored: true as const };
  });
}

/** Several out of the bin (W-63, the bin's Restore). Each on its own: one refused does not hold the rest. */
export async function restoreManyFromBin(
  actor: RetailAuditActor,
  items: BinInput[],
  now: Date = new Date(),
): Promise<{ restored: number; refused: Array<{ kind: BinKind; id: string; name: string; why: string }> }> {
  let restored = 0;
  const refused: Array<{ kind: BinKind; id: string; name: string; why: string }> = [];
  for (const item of items) {
    try {
      await restoreFromBin(actor, item, now);
      restored += 1;
    } catch (error) {
      if (!(error instanceof BinRefusal)) throw error;
      const found = await KINDS[item.kind].find(prisma, actor.companyId, item.id);
      refused.push({ kind: item.kind, id: item.id, name: found?.name ?? "It", why: error.message });
    }
  }
  return { restored, refused };
}

/**
 * Gone for good, one record, inside its own transaction: the kind's purge
 * (deleted, or kept for its history) and one `RETAIL_RECORD.PURGED` event.
 * Null when it is not in the bin, is another company's or went already.
 */
async function purgeOne(
  companyId: string,
  actor: RetailAuditActor | null,
  spec: BinKindSpec,
  id: string,
  before?: Date,
): Promise<"deleted" | "kept" | null> {
  return prisma.$transaction(async (tx) => {
    await lockRecord(tx, spec, id);
    const found = await spec.find(tx, companyId, id);
    if (!found?.archivedAt) return null;
    if (before && found.archivedAt >= before) return null;
    if (await purgedSince(tx, companyId, spec.entityType, id, found.archivedAt)) return null;
    const how = await spec.purge(tx, companyId, id);
    await auditRecordPurged(tx, { companyId, actor, entityType: spec.entityType, entityId: id, kind: spec.kind, name: found.name, how });
    return how;
  });
}

/**
 * "Delete for good" (the owner, W-63): each one deleted, or kept for the
 * history that refers to it; either way gone from the bin. One that is not
 * in the bin is skipped.
 */
export async function deleteFromBinForGood(
  actor: RetailAuditActor,
  items: BinInput[],
): Promise<{ deleted: number; kept: number }> {
  let deleted = 0;
  let kept = 0;
  for (const item of items) {
    const how = await purgeOne(actor.companyId, actor, KINDS[item.kind], item.id);
    if (how === "deleted") deleted += 1;
    if (how === "kept") kept += 1;
  }
  return { deleted, kept };
}

/**
 * The nightly purge (`scripts/retail-worker.ts`, 02:00): everything in every
 * shop's bin more than 30 days, gone for good with an event nobody did. Safe
 * to run twice: what went already is not found again.
 */
export async function purgeExpiredBin(now: Date = new Date()): Promise<{ deleted: number; kept: number }> {
  const before = binWindowStart(now);
  let deleted = 0;
  let kept = 0;
  for (const spec of Object.values(KINDS)) {
    for (const row of await spec.listBinned({ before })) {
      const how = await purgeOne(row.companyId, null, spec, row.id, before);
      if (how === "deleted") deleted += 1;
      if (how === "kept") kept += 1;
    }
  }
  return { deleted, kept };
}

/** What the bin banner says about a binned record (00-foundations 5.6.3). */
export type BinState = {
  since: string;
  keptUntil: string;
  restorable: boolean;
  /** Deleted for good and kept for its history: never restorable. */
  purged: boolean;
  /** Who moved it, from the latest of its kind's bin events; null when nobody is on record. */
  by: { id: string | null; name: string } | null;
};

/** "Tendai Mhlanga": the actor's name as the event wrote it, else as the user is called now. */
async function actorName(event: { actor: string | null; payloadJson: string | null }): Promise<string | null> {
  const payload = event.payloadJson ? (JSON.parse(event.payloadJson) as { actorName?: string | null }) : {};
  if (payload.actorName) return payload.actorName;
  if (!event.actor) return null;
  return (await prisma.user.findFirst({ where: { id: event.actor }, select: { name: true } }))?.name ?? null;
}

/**
 * The banner's facts for a record, or null when it is not in the bin. "When"
 * is `archivedAt`; "who" is the latest bin event for the entity.
 */
export async function binState(
  companyId: string,
  entityType: string,
  entityId: string,
  archivedAt: Date | string | null,
  now: Date = new Date(),
): Promise<BinState | null> {
  if (!archivedAt) return null;
  const since = new Date(archivedAt);
  const [event, purged] = await Promise.all([
    prisma.platformAuditEvent.findFirst({
      where: {
        companyId,
        entityType,
        entityId,
        eventType: { in: binKindForEntity(entityType)?.binEvents ?? [RETAIL_AUDIT_EVENTS.recordBinned] },
      },
      orderBy: { createdAt: "desc" },
      select: { actor: true, payloadJson: true },
    }),
    purgedSince(prisma, companyId, entityType, entityId, since),
  ]);
  const by: BinState["by"] = event ? { id: event.actor, name: (await actorName(event)) ?? "Someone" } : null;
  return {
    since: since.toISOString(),
    keptUntil: restorableUntil(since).toISOString(),
    restorable: !purged && stillRestorable(since, now),
    purged,
    by,
  };
}

/** One row of Setup › Bin (`retail-bin`). */
export type BinEntry = {
  kind: BinKind;
  id: string;
  name: string;
  reference: string | null;
  label: string;
  binnedAt: Date;
  binnedBy: string | null;
};

/**
 * What is in a shop's bin now: every kind's records binned in the last 30
 * days and not deleted for good, with who moved each (the actor of the
 * latest of its kind's `binEvents`).
 */
export async function listBinEntries(companyId: string, now: Date = new Date()): Promise<BinEntry[]> {
  const from = binWindowStart(now);
  const perKind = await Promise.all(
    Object.values(KINDS).map(async (spec) => ({ spec, rows: await spec.listBinned({ companyId, from }) })),
  );
  const keys = perKind.flatMap(({ spec, rows }) => rows.map((row) => ({ entityType: spec.entityType, entityId: row.id })));
  if (keys.length === 0) return [];

  const events = await prisma.platformAuditEvent.findMany({
    where: {
      companyId,
      eventType: { in: [...new Set([...perKind.flatMap(({ spec }) => spec.binEvents), RETAIL_AUDIT_EVENTS.recordPurged])] },
      OR: perKind
        .filter(({ rows }) => rows.length)
        .map(({ spec, rows }) => ({ entityType: spec.entityType, entityId: { in: rows.map((row) => row.id) } })),
    },
    orderBy: { createdAt: "desc" },
    select: { eventType: true, entityType: true, entityId: true, actor: true, payloadJson: true, createdAt: true },
  });

  const entries: BinEntry[] = [];
  for (const { spec, rows } of perKind) {
    for (const row of rows) {
      const own = events.filter((event) => event.entityType === spec.entityType && event.entityId === row.id);
      if (own.some((event) => event.eventType === RETAIL_AUDIT_EVENTS.recordPurged && event.createdAt >= row.binnedAt)) continue;
      const binned = own.find((event) => spec.binEvents.includes(event.eventType));
      entries.push({
        kind: spec.kind,
        id: row.id,
        name: row.name,
        reference: row.reference,
        label: spec.labelFor?.(row) ?? spec.label,
        binnedAt: row.binnedAt,
        binnedBy: binned ? await actorName(binned) : null,
      });
    }
  }
  return entries.sort((left, right) => left.binnedAt.getTime() - right.binnedAt.getTime());
}
