import { Prisma, type RetailPriceChangeSource } from "@prisma/client";

import { money, toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import type { ApprovalLimits } from "@/lib/retail/approvals/limits";
import { auditAmount, auditPriceChanged, type RetailAuditActor } from "@/lib/retail/audit";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { formatMoney } from "@/lib/workspace/format";

/**
 * The price-change core (20-products 4.5, PRD-03): every price on a list moves
 * through `changePrices`, now or on a date, and leaves a `ProductPriceChange`
 * row behind — the price history, "Was" and "Changed". A change dated later
 * waits until `applyDuePriceChanges` claims it. Followers (a list that follows
 * another, a price that follows the cost) are PRD-05's.
 */

type Tx = Prisma.TransactionClient;

/** The default list: the one every new product goes on and the till prices from. */
export class DefaultListMissing extends Error {
  constructor() {
    super("This shop has no default price list.");
  }
}

export async function defaultPriceList(tx: Tx | typeof prisma, companyId: string) {
  const list = await tx.priceList.findFirst({
    where: { companyId, isDefault: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, currency: true, isDefault: true },
  });
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

export type PriceRow = { productId: string; price: Prisma.Decimal.Value; minQuantity?: Prisma.Decimal.Value };

export type PriceChangeResult = { applied: number; scheduled: number; refused: Record<string, string> };

const ONE = new Prisma.Decimal(1);

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
  },
): Promise<boolean> {
  const key = { priceListId: input.list.id, productId: input.productId, minQuantity: input.minQuantity };
  const existing = await tx.productPrice.findUnique({
    where: { priceListId_productId_minQuantity: key },
    select: { unitPrice: true },
  });
  const from = existing?.unitPrice ?? null;
  if (!input.changeId && from !== null && input.to !== null && from.equals(input.to)) return false;

  if (input.to === null) {
    if (existing) await tx.productPrice.delete({ where: { priceListId_productId_minQuantity: key } });
  } else {
    await tx.productPrice.upsert({
      where: { priceListId_productId_minQuantity: key },
      create: { companyId: input.companyId, ...key, unitPrice: input.to },
      update: { unitPrice: input.to },
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
  return true;
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

  const refused: Record<string, string> = {};
  const checked: Array<{ productId: string; price: Prisma.Decimal; minQuantity: Prisma.Decimal }> = [];
  for (const row of input.rows) {
    const product = byId.get(row.productId);
    if (!product) {
      refused[row.productId] = "That product is not one of this shop's.";
      continue;
    }
    let price: Prisma.Decimal;
    try {
      price = money(row.price);
    } catch {
      refused[row.productId] = "Write the price as a figure, like 2.10.";
      continue;
    }
    if (price.isNegative()) {
      refused[row.productId] = "A price is zero or more.";
      continue;
    }
    const owner = priceChangeNeedsOwner(input.limits, input.actor, { price, cost: product.costPrice });
    if (owner) {
      refused[row.productId] = owner;
      continue;
    }
    checked.push({ productId: row.productId, price, minQuantity: new Prisma.Decimal(row.minQuantity ?? 1) });
  }
  if (Object.keys(refused).length > 0) throw new PriceRefusal(refused);

  const now = new Date();
  const effectiveAt = input.effectiveAt ?? now;
  let applied = 0;
  let scheduled = 0;
  for (const row of checked) {
    if (effectiveAt.getTime() <= now.getTime()) {
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
  return { applied, scheduled, refused: {} };
}

/**
 * Apply every scheduled change that has come due, once. Each row is claimed
 * by setting its `appliedAt` where it is still empty, so two runs at the same
 * moment apply each row exactly once; one transaction per list.
 */
export async function applyDuePriceChanges(companyId: string, now: Date = new Date()): Promise<number> {
  const due = await prisma.productPriceChange.findMany({
    where: { companyId, effectiveAt: { lte: now }, appliedAt: null, cancelledAt: null },
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
          WHERE "id" = ${row.id} AND "appliedAt" IS NULL AND "cancelledAt" IS NULL`;
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
