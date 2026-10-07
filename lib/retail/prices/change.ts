import { Prisma, type RetailPriceChangeSource } from "@prisma/client";

import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import type { ApprovalLimits } from "@/lib/retail/approvals/limits";
import { auditAmount, auditPriceChanged, type RetailAuditActor } from "@/lib/retail/audit";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { formatMoney } from "@/lib/workspace/format";

import { centsOf, PRICE_FIGURE_MESSAGE } from "./figure";

/**
 * The price-change core (20-products 4.5, PRD-03): every price on a list moves
 * through `changePrices`, now or on a date, and leaves a `ProductPriceChange`
 * row behind — the price history, "Was" and "Changed". A change dated later
 * waits until `applyDuePriceChanges` claims it. Followers (PRD-05): a price on
 * a list that follows another moves with its base's price, and one on a list
 * that follows the cost moves with the cost, each with its own FOLLOWED row;
 * a price typed on a follower stops it following.
 */

type Tx = Prisma.TransactionClient;

/** The default list: the one every new product goes on and the till prices from. */
export class DefaultListMissing extends Error {
  constructor() {
    super("This shop has no default price list.");
  }
}

/** The live default list (one per company, a partial unique index), or null. */
export async function findDefaultPriceList(tx: Tx | typeof prisma, companyId: string) {
  return tx.priceList.findFirst({
    where: { companyId, isDefault: true, archivedAt: null },
    select: { id: true, name: true, currency: true, taxInclusive: true, isDefault: true },
  });
}

export async function defaultPriceList(tx: Tx | typeof prisma, companyId: string) {
  const list = await findDefaultPriceList(tx, companyId);
  if (!list) throw new DefaultListMissing();
  return list;
}

/** Rows refused, each with its sentence. Nothing was saved. */
export class PriceRefusal extends Error {
  readonly status = 400;
  constructor(readonly refused: Record<string, string>) {
    super(Object.values(refused)[0] ?? "That price was not saved.");
  }
}

/**
 * Whether this change waits for the owner, and why (ADM-04 limits): one
 * predicate, so ADM-05 can queue an approval where this refuses (C-32). An
 * owner (`retail.prices:approve`) never waits.
 */
export function priceChangeNeedsOwner(
  limits: Pick<ApprovalLimits, "priceChanges" | "belowCostNeedsOwner">,
  actor: { userRole?: string | null },
  row: { price: Prisma.Decimal; cost: Prisma.Decimal | null },
): string | null {
  if (canRetailRoleDo(actor.userRole, "retail.prices", "approve")) return null;
  if (limits.priceChanges === "OWNER") return "Price changes need the owner.";
  if (limits.belowCostNeedsOwner && row.cost !== null && row.price.lessThan(row.cost)) {
    return `Below cost needs the owner. It costs ${formatMoney(toNumberOrZero(row.cost))}.`;
  }
  return null;
}

/**
 * A price as typed ("18.99", "US$ 18.99"), read by `centsOf`: anything else is
 * refused, never rounded. `was` is the price the person saw when they typed
 * it ("" for none): a row someone else has changed since is refused.
 */
export type PriceRow = { productId: string; price: string; minQuantity?: Prisma.Decimal.Value; was?: string };

export type PriceChangeResult = {
  applied: number;
  scheduled: number;
  /** Changes that were waiting for these prices, cancelled because a price was set by hand now. */
  unscheduled: number;
};

/** The worksheet's row moved under the person typing on it. */
export const changedSinceSentence = (now: Prisma.Decimal | null) =>
  `Changed by someone else since you opened the list. It is ${now === null ? "off the list now" : `now ${formatMoney(toNumberOrZero(now))}`}.`;

const ONE = new Prisma.Decimal(1);

/** `price × (1 + adjust/100)` to the cent: a follower's price off its base (or the cost). */
export function followPrice(base: Prisma.Decimal.Value, adjustPercent: Prisma.Decimal.Value | null): Prisma.Decimal {
  const adjust = new Prisma.Decimal(adjustPercent ?? 0);
  return new Prisma.Decimal(base).times(adjust.dividedBy(100).plus(1)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * The price on a list row, with the row locked until the transaction ends:
 * two saves of one price at the same moment take turns, so the second reads
 * the price the first left and the history links from one to the next.
 */
async function lockedPrice(
  tx: Tx,
  key: { priceListId: string; productId: string; minQuantity: Prisma.Decimal },
): Promise<Prisma.Decimal | null> {
  const rows = await tx.$queryRaw<Array<{ unitPrice: string }>>`
    SELECT "unitPrice"::text AS "unitPrice" FROM "ProductPrice"
    WHERE "priceListId" = ${key.priceListId} AND "productId" = ${key.productId} AND "minQuantity" = ${key.minQuantity}
    FOR UPDATE`;
  return rows[0] ? new Prisma.Decimal(rows[0].unitPrice) : null;
}

/** A typed or bulk price is the owner's own: that row stops following its base. */
const OWN_SOURCES: RetailPriceChangeSource[] = ["TYPED", "BULK"];

/** Put one price on its list now: the list row, the fallback, the history and the event. */
async function applyPrice(
  tx: Tx,
  input: {
    companyId: string;
    actor: RetailAuditActor | null;
    list: { id: string; name: string; isDefault: boolean };
    productId: string;
    minQuantity: Prisma.Decimal;
    to: Prisma.Decimal | null;
    source: RetailPriceChangeSource;
    at: Date;
    /** The scheduled row this applies; else a new row is written. */
    changeId?: string;
    batchId?: string | null;
    /** Lists already moved in this chain, so a follower of a follower never comes back round. */
    visited?: Set<string>;
  },
): Promise<boolean> {
  const key = { priceListId: input.list.id, productId: input.productId, minQuantity: input.minQuantity };
  const from = await lockedPrice(tx, key);
  if (!input.changeId && from !== null && input.to !== null && from.equals(input.to)) return false;

  if (input.to === null) {
    if (from !== null) await tx.productPrice.delete({ where: { priceListId_productId_minQuantity: key } });
  } else {
    const own = OWN_SOURCES.includes(input.source);
    await tx.productPrice.upsert({
      where: { priceListId_productId_minQuantity: key },
      create: { companyId: input.companyId, ...key, unitPrice: input.to },
      update: { unitPrice: input.to, ...(own ? { followsBase: false } : {}) },
    });
    // The fallback the resolver reaches for stays the default list's single price.
    if (input.list.isDefault && input.minQuantity.equals(ONE)) {
      await tx.product.update({ where: { id: input.productId }, data: { standardPrice: input.to } });
    }
  }

  if (input.changeId) {
    await tx.productPriceChange.update({ where: { id: input.changeId }, data: { fromPrice: from } });
  } else {
    await tx.productPriceChange.create({
      data: {
        companyId: input.companyId,
        priceListId: input.list.id,
        productId: input.productId,
        minQuantity: input.minQuantity,
        fromPrice: from,
        toPrice: input.to,
        source: input.source,
        batchId: input.batchId ?? null,
        effectiveAt: input.at,
        appliedAt: input.at,
        createdById: input.actor?.userId ?? null,
      },
    });
  }
  await auditPriceChanged(tx, {
    companyId: input.companyId,
    actor: input.actor,
    productId: input.productId,
    payload: { list: input.list.name, from: auditAmount(from), to: auditAmount(input.to), how: input.source },
  });
  if (input.to !== null) {
    await moveFollowers(tx, { ...input, to: input.to, visited: new Set([...(input.visited ?? []), input.list.id]) });
  }
  return true;
}

/**
 * The rows that mirror the base row that just moved, moved with it: on a live
 * list whose basis is this list, still following, the row at the same minimum
 * quantity — and, when the single price moved, the follower's own list-minimum
 * row (Wholesale from 6) unless the base has a break of its own there. A
 * follower's other volume breaks keep their prices. One hop each,
 * recursively, and never back into a list already moved in the chain.
 */
async function moveFollowers(
  tx: Tx,
  input: {
    companyId: string;
    actor: RetailAuditActor | null;
    list: { id: string };
    productId: string;
    minQuantity: Prisma.Decimal;
    to: Prisma.Decimal;
    at: Date;
    batchId?: string | null;
    visited: Set<string>;
  },
) {
  const rows = await tx.productPrice.findMany({
    where: {
      companyId: input.companyId,
      productId: input.productId,
      followsBase: true,
      priceList: { basis: "LIST", basisListId: input.list.id, archivedAt: null },
    },
    select: {
      minQuantity: true,
      priceList: { select: { id: true, name: true, isDefault: true, adjustPercent: true, minQuantity: true } },
    },
  });
  if (rows.length === 0) return;
  const baseBreaks = input.minQuantity.equals(ONE)
    ? (
        await tx.productPrice.findMany({
          where: { priceListId: input.list.id, productId: input.productId },
          select: { minQuantity: true },
        })
      ).map((row) => row.minQuantity)
    : [];
  const mirrors = (row: (typeof rows)[number]) => {
    if (row.minQuantity.equals(input.minQuantity)) return true;
    if (!input.minQuantity.equals(ONE) || row.priceList.minQuantity <= 1) return false;
    return row.minQuantity.equals(row.priceList.minQuantity) && !baseBreaks.some((at) => at.equals(row.minQuantity));
  };
  for (const row of rows) {
    if (input.visited.has(row.priceList.id) || !mirrors(row)) continue;
    await applyPrice(tx, {
      companyId: input.companyId,
      actor: input.actor,
      list: row.priceList,
      productId: input.productId,
      minQuantity: new Prisma.Decimal(row.minQuantity),
      to: followPrice(input.to, row.priceList.adjustPercent),
      source: "FOLLOWED",
      at: input.at,
      batchId: input.batchId,
      visited: input.visited,
    });
  }
}

/**
 * The cost moved (the record's Cost, a delivery): every row still following
 * the cost on a live COST list is priced again off it, each with its FOLLOWED
 * history (and its own followers after it).
 */
export async function repriceCostFollowers(tx: Tx, companyId: string, productId: string, actor: RetailAuditActor | null = null) {
  const product = await tx.product.findFirst({ where: { id: productId, companyId }, select: { costPrice: true } });
  if (!product?.costPrice) return 0;
  const rows = await tx.productPrice.findMany({
    where: { companyId, productId, followsBase: true, priceList: { basis: "COST", archivedAt: null } },
    select: { minQuantity: true, priceList: { select: { id: true, name: true, isDefault: true, adjustPercent: true } } },
  });
  let moved = 0;
  for (const row of rows) {
    const changed = await applyPrice(tx, {
      companyId,
      actor,
      list: row.priceList,
      productId,
      minQuantity: new Prisma.Decimal(row.minQuantity),
      to: followPrice(product.costPrice, row.priceList.adjustPercent),
      source: "FOLLOWED",
      at: new Date(),
    });
    if (changed) moved += 1;
  }
  return moved;
}

/**
 * Change prices on one list, all or nothing. Every product must be the
 * company's and live; a price is zero or more; the owner rule is asked per
 * row. Any refusal throws `PriceRefusal` with every refused row's sentence and
 * saves nothing. `effectiveAt` in the future writes only the history row; the
 * price moves when `applyDuePriceChanges` reaches it.
 */
export async function changePrices(
  tx: Tx,
  input: {
    companyId: string;
    actor: RetailAuditActor;
    listId: string;
    rows: PriceRow[];
    source: RetailPriceChangeSource;
    batchId?: string | null;
    effectiveAt?: Date | null;
    limits: Pick<ApprovalLimits, "priceChanges" | "belowCostNeedsOwner">;
  },
): Promise<PriceChangeResult> {
  const list = await tx.priceList.findFirst({
    where: { id: input.listId, companyId: input.companyId },
    select: { id: true, name: true, isDefault: true },
  });
  if (!list) {
    throw new PriceRefusal(Object.fromEntries(input.rows.map((row) => [row.productId, "That price list is not one of this shop's."])));
  }
  const products = await tx.product.findMany({
    where: { id: { in: input.rows.map((row) => row.productId) }, companyId: input.companyId, archivedAt: null },
    select: { id: true, costPrice: true },
  });
  const byId = new Map(products.map((product) => [product.id, product]));

  const now = new Date();
  const effectiveAt = input.effectiveAt ?? now;
  const dueNow = effectiveAt.getTime() <= now.getTime();
  const refused: Record<string, string> = {};
  const checked: Array<{ productId: string; price: Prisma.Decimal; minQuantity: Prisma.Decimal }> = [];
  // In one order, so two saves that share rows lock them the same way round.
  const rows = [...input.rows].sort((a, b) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0));
  for (const row of rows) {
    const product = byId.get(row.productId);
    if (!product) {
      refused[row.productId] = "That product is not one of this shop's.";
      continue;
    }
    const cents = centsOf(row.price);
    if (cents === null) {
      refused[row.productId] = PRICE_FIGURE_MESSAGE;
      continue;
    }
    const price = new Prisma.Decimal(cents).dividedBy(100);
    const owner = priceChangeNeedsOwner(input.limits, input.actor, { price, cost: product.costPrice });
    if (owner) {
      refused[row.productId] = owner;
      continue;
    }
    const minQuantity = new Prisma.Decimal(row.minQuantity ?? 1);
    if (row.was !== undefined && dueNow) {
      const current = await lockedPrice(tx, { priceListId: list.id, productId: row.productId, minQuantity });
      const seen = row.was.trim() === "" ? null : centsOf(row.was);
      if ((current === null ? null : current.times(100).toNumber()) !== seen) {
        refused[row.productId] = changedSinceSentence(current);
        continue;
      }
    }
    checked.push({ productId: row.productId, price, minQuantity });
  }
  if (Object.keys(refused).length > 0) throw new PriceRefusal(refused);

  let applied = 0;
  let scheduled = 0;
  let unscheduled = 0;
  for (const row of checked) {
    if (dueNow) {
      // A price set by hand now is the latest word on it: what was waiting for it on this list is cancelled.
      if (OWN_SOURCES.includes(input.source)) {
        const cancelled = await tx.productPriceChange.updateMany({
          where: { priceListId: list.id, productId: row.productId, minQuantity: row.minQuantity, appliedAt: null, cancelledAt: null },
          data: { cancelledAt: now },
        });
        unscheduled += cancelled.count;
      }
      const moved = await applyPrice(tx, {
        companyId: input.companyId,
        actor: input.actor,
        list,
        productId: row.productId,
        minQuantity: row.minQuantity,
        to: row.price,
        source: input.source,
        at: now,
        batchId: input.batchId,
      });
      if (moved) applied += 1;
      continue;
    }
    const current = await tx.productPrice.findUnique({
      where: { priceListId_productId_minQuantity: { priceListId: list.id, productId: row.productId, minQuantity: row.minQuantity } },
      select: { unitPrice: true },
    });
    await tx.productPriceChange.create({
      data: {
        companyId: input.companyId,
        priceListId: list.id,
        productId: row.productId,
        minQuantity: row.minQuantity,
        fromPrice: current?.unitPrice ?? null,
        toPrice: row.price,
        source: input.source,
        batchId: input.batchId ?? null,
        effectiveAt,
        appliedAt: null,
        createdById: input.actor.userId,
      },
    });
    scheduled += 1;
  }
  return { applied, scheduled, unscheduled };
}

/**
 * Apply every scheduled change that has come due, once. Each row is claimed
 * by setting its `appliedAt` where it is still empty, so two runs at the same
 * moment apply each row exactly once; one transaction per list.
 *
 * A change that comes due while its product is in the bin is cancelled, not
 * applied: the product left every list, and restored it comes back at the
 * price it went in with, not one set for a shop it was no longer in.
 */
export async function applyDuePriceChanges(companyId: string, now: Date = new Date()): Promise<number> {
  const waiting = { companyId, effectiveAt: { lte: now }, appliedAt: null, cancelledAt: null };
  await prisma.productPriceChange.updateMany({
    where: { ...waiting, product: { archivedAt: { not: null } } },
    data: { cancelledAt: now },
  });
  const due = await prisma.productPriceChange.findMany({
    where: { ...waiting, product: { archivedAt: null } },
    orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      priceListId: true,
      productId: true,
      minQuantity: true,
      toPrice: true,
      source: true,
      createdBy: { select: { id: true, name: true, role: true } },
    },
  });
  const byList = new Map<string, typeof due>();
  for (const row of due) byList.set(row.priceListId, [...(byList.get(row.priceListId) ?? []), row]);

  let applied = 0;
  for (const [listId, rows] of byList) {
    applied += await prisma.$transaction(async (tx) => {
      const list = await tx.priceList.findUniqueOrThrow({ where: { id: listId }, select: { id: true, name: true, isDefault: true } });
      let mine = 0;
      for (const row of rows) {
        const claimed = await tx.$executeRaw`
          UPDATE "ProductPriceChange" SET "appliedAt" = ${now}
          WHERE "id" = ${row.id} AND "appliedAt" IS NULL AND "cancelledAt" IS NULL
            AND EXISTS (SELECT 1 FROM "Product" WHERE "id" = ${row.productId} AND "archivedAt" IS NULL)`;
        if (claimed !== 1) continue;
        await applyPrice(tx, {
          companyId,
          actor: row.createdBy
            ? { companyId, userId: row.createdBy.id, userName: row.createdBy.name, userRole: row.createdBy.role }
            : null,
          list,
          productId: row.productId,
          minQuantity: row.minQuantity,
          to: row.toPrice,
          source: row.source,
          at: now,
          changeId: row.id,
        });
        mine += 1;
      }
      return mine;
    });
  }
  return applied;
}
