import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { BIN_KEEP_DAYS, restorableUntil } from "@/lib/retail/asks";
import { auditRecordBin, RETAIL_AUDIT_EVENTS, type RetailAuditActor } from "@/lib/retail/audit";
import { categoryBinRefusal, restoreCategory } from "@/lib/retail/categories";
import type { RetailAction, RetailResource } from "@/lib/retail/permission-matrix";
import { archiveShelfListing, restoreShelfListing } from "@/lib/retail/shelf-listing";

/**
 * The shop's bin: what was removed, and the way back (W-63, 00-foundations 4.6).
 *
 * Nothing a shop removes is deleted. A product has sale lines pointing at it,
 * a promotion has receipts that name it, a category has products filed under
 * it; each goes in the bin instead — `archivedAt` set, off every list, lookup
 * and the till — and can be restored for 30 days by whoever holds Bin update.
 *
 * Each binnable kind registers here once: its entity type (the one its audit
 * events and Activity use), the delete right that moves it to the bin, how to
 * find it, and its own move and restore, which run inside the bin's
 * transaction beside the `RETAIL_RECORD.BINNED` / `RESTORED` event. Area specs
 * add their kinds to `BIN_KINDS` and `KINDS`.
 */

export const BIN_KINDS = ["product", "promotion", "category"] as const;
export type BinKind = (typeof BIN_KINDS)[number];

type Tx = Prisma.TransactionClient;

type Found = { name: string; archivedAt: Date | null };

export type BinKindSpec = {
  kind: BinKind;
  /** "product": what the bin list calls it. */
  label: string;
  /** The entity type its audit events are written under. */
  entityType: string;
  /** Moving one to the bin is this right (the record's D on the Roles board). */
  deleteRight: [RetailResource, RetailAction];
  find(tx: Tx, companyId: string, id: string): Promise<Found | null>;
  /** Into the bin. A sentence refuses it (409), passed through as it is. */
  move(tx: Tx, companyId: string, id: string, at: Date): Promise<string | null>;
  /** Out of the bin. A sentence refuses it (409), passed through as it is. */
  restore(tx: Tx, companyId: string, id: string): Promise<string | null>;
};

const KINDS: Record<BinKind, BinKindSpec> = {
  product: {
    kind: "product",
    label: "Product",
    entityType: "Product",
    deleteRight: ["retail.catalog", "delete"],
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
  },
  promotion: {
    kind: "promotion",
    label: "Promotion",
    entityType: "RetailPromotion",
    deleteRight: ["retail.promotions", "delete"],
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
  },
  category: {
    kind: "category",
    label: "Category",
    entityType: "RetailCategory",
    deleteRight: ["retail.categories", "delete"],
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

/** Out of the bin. Throws `BinRefusal`: 404 when it is not in it, 410 after 30 days. */
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

/** What the bin banner says about a binned record (00-foundations 5.6.3). */
export type BinState = {
  since: string;
  keptUntil: string;
  restorable: boolean;
  /** Who moved it, from the latest `RETAIL_RECORD.BINNED` event; null when nobody is on record. */
  by: { id: string | null; name: string } | null;
};

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
  const event = await prisma.platformAuditEvent.findFirst({
    where: { companyId, entityType, entityId, eventType: RETAIL_AUDIT_EVENTS.recordBinned },
    orderBy: { createdAt: "desc" },
    select: { actor: true, payloadJson: true },
  });
  let by: BinState["by"] = null;
  if (event) {
    const payload = event.payloadJson ? (JSON.parse(event.payloadJson) as { actorName?: string | null }) : {};
    const name =
      payload.actorName ??
      (event.actor
        ? (await prisma.user.findFirst({ where: { id: event.actor }, select: { name: true } }))?.name
        : null);
    by = { id: event.actor, name: name ?? "Someone" };
  }
  return {
    since: since.toISOString(),
    keptUntil: restorableUntil(since).toISOString(),
    restorable: stillRestorable(since, now),
    by,
  };
}

export type BinEntry = {
  kind: BinKind;
  id: string;
  name: string;
  detail: string | null;
  removedAt: string;
};

/** Setup › Bin's list (the admin spec owns the page). */
export async function listBin(companyId: string): Promise<BinEntry[]> {
  const [products, promotions, categories] = await Promise.all([
    prisma.product.findMany({
      where: { companyId, archivedAt: { not: null } },
      select: { id: true, name: true, code: true, standardPrice: true, archivedAt: true },
    }),
    prisma.retailPromotion.findMany({
      where: { companyId, archivedAt: { not: null } },
      select: { id: true, name: true, promoCode: true, archivedAt: true },
    }),
    prisma.retailCategory.findMany({
      where: { companyId, archivedAt: { not: null } },
      select: { id: true, name: true, archivedAt: true },
    }),
  ]);

  const entries: BinEntry[] = [
    ...products.map((row) => ({
      kind: "product" as const,
      id: row.id,
      name: row.name,
      detail: `${row.code} · last priced ${toNumberOrZero(row.standardPrice).toFixed(2)}`,
      removedAt: row.archivedAt!.toISOString(),
    })),
    ...promotions.map((row) => ({
      kind: "promotion" as const,
      id: row.id,
      name: row.name,
      detail: row.promoCode,
      removedAt: row.archivedAt!.toISOString(),
    })),
    ...categories.map((row) => ({
      kind: "category" as const,
      id: row.id,
      name: row.name,
      // Its products went to another category when it was deleted.
      detail: "Comes back with no products",
      removedAt: row.archivedAt!.toISOString(),
    })),
  ];
  return entries.sort((left, right) => right.removedAt.localeCompare(left.removedAt));
}
