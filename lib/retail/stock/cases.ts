import { z } from "zod";

import { reserveIdentifier } from "@/lib/id-generator";
import { recordStockMovement } from "@/lib/inventory/stock-movements";
import type { Prisma } from "@prisma/client";

import { money, quantity, toNumberOrZero, ZERO } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { loadShopProfile, shopFeatures } from "@/lib/retail/shop-profile";
import { formatCount } from "@/lib/workspace/format";

/**
 * Cases and singles (30-stock W-26, STK-04).
 *
 * A bottle store buys Castle Lager by the case of 24 and sells it both ways:
 * a case over the counter, or singles out of the fridge. Each is its own
 * product with its own price and its own stock line; the case knows which
 * single it holds and how many (`Product.packOfId`, `packSize`).
 *
 * When the singles run low, somebody opens a case. That is the one thing that
 * moves stock between the two: cases out, their singles in, at the same
 * branch, in one transaction under one BRK reference. The value does not
 * change — it is the same beer, on the same inventory account — so nothing
 * posts to the ledger; the singles come in at the case's cost shared over the
 * bottles, averaged with the singles already there (`blendedCost`), so the
 * shelf's singles are not revalued.
 *
 * A manager or stock clerk opens cases on the product record
 * (`retail.adjustments:create`). A cashier may too, from the till, only when
 * they are on an open shift at that branch and the singles have run out.
 */

export const breakCaseInput = z.object({
  caseProductId: z.string().uuid("Pick a case."),
  siteId: z.string().uuid("Pick a site.").optional().nullable(),
  cases: z.number({ message: "Say how many cases to open" }).int("Say how many cases to open").min(1, "Say how many cases to open").max(500, "Say how many cases to open"),
});

export type BreakCaseResult = {
  reference: string;
  cases: number;
  singles: number;
  caseOnHand: number;
  singleOnHand: number;
  message: string;
};

/** The till rule's refusal, and the door's for a role that holds neither right. */
export const CANNOT_ADJUST = "Your role cannot adjust stock";

export class CaseBreakRefused extends Error {
  constructor(
    message: string,
    readonly status: 403 | 409 = 409,
  ) {
    super(message);
    this.name = "CaseBreakRefused";
  }
}

/** "1 case broken. 26 singles on hand." */
export function brokenToast(cases: number, singleOnHand: number): string {
  return `${formatCount(cases)} ${cases === 1 ? "case" : "cases"} broken. ${formatCount(singleOnHand)} ${singleOnHand === 1 ? "single" : "singles"} on hand.`;
}

/** Where the case is opened: the site asked, the till's shift, the default site, else the case's only line. */
async function siteFor(
  companyId: string,
  caseProductId: string,
  asked: string | null | undefined,
  shiftSiteId: string | null,
): Promise<string | null> {
  if (asked) return asked;
  if (shiftSiteId) return shiftSiteId;
  const [profile, lines] = await Promise.all([
    prisma.retailShopProfile.findUnique({ where: { companyId }, select: { defaultSiteId: true } }),
    prisma.inventoryItem.findMany({ where: { productId: caseProductId, site: { companyId } }, select: { siteId: true } }),
  ]);
  if (profile?.defaultSiteId && lines.some((line) => line.siteId === profile.defaultSiteId)) return profile.defaultSiteId;
  return lines.length === 1 ? lines[0]!.siteId : (profile?.defaultSiteId ?? null);
}

/**
 * The singles' cost after a break: what was on hand at its cost and what came
 * out of the case at the case's, averaged over them all, to the cent. The
 * singles already on the shelf keep their value; the case's value moves into
 * them whole, give or take the cent's rounding. Null when the case has no
 * cost: the line keeps its own.
 */
export function blendedCost(
  before: { onHand: Prisma.Decimal; unitCost: Prisma.Decimal | null },
  singles: number,
  caseShare: Prisma.Decimal | null,
): Prisma.Decimal | null {
  if (caseShare === null) return null;
  const held = before.unitCost !== null && before.onHand.greaterThan(0) ? before.onHand : ZERO;
  const value = held.times(before.unitCost ?? 0).plus(caseShare.times(singles));
  return value.dividedBy(held.plus(singles)).toDecimalPlaces(2);
}

export async function breakCase(input: {
  actor: RetailAuditActor;
  caseProductId: string;
  siteId?: string | null;
  cases: number;
}): Promise<BreakCaseResult> {
  const { actor } = input;
  const { companyId } = actor;

  const features = shopFeatures(await loadShopProfile(companyId));
  if (!features.casesAndSingles) throw new CaseBreakRefused("Cases and singles is off for this shop.");

  const pack = await prisma.product.findFirst({
    where: { id: input.caseProductId, companyId, archivedAt: null },
    select: {
      name: true,
      packSize: true,
      packOf: { select: { id: true, name: true, code: true, archivedAt: true } },
    },
  });
  if (!pack) throw new CaseBreakRefused("That product is not this shop's.");
  if (!pack.packOf || !pack.packSize || pack.packOf.archivedAt) {
    throw new CaseBreakRefused(`${pack.name} is not set up as a case of singles.`);
  }

  // The till's case: a cashier on an open shift at that branch whose singles have run out.
  const atTill = !canRetailRoleDo(actor.userRole, "retail.adjustments", "create");
  let shiftSiteId: string | null = null;
  if (atTill) {
    if (!canRetailRoleDo(actor.userRole, "retail.sell", "create")) throw new CaseBreakRefused(CANNOT_ADJUST, 403);
    const shift = await prisma.retailShift.findFirst({
      where: { companyId, cashierId: actor.userId, status: "OPEN", ...(input.siteId ? { siteId: input.siteId } : {}) },
      orderBy: { openedAt: "desc" },
      select: { siteId: true },
    });
    if (!shift) throw new CaseBreakRefused(CANNOT_ADJUST, 403);
    shiftSiteId = shift.siteId;
  }

  const siteId = await siteFor(companyId, input.caseProductId, input.siteId, shiftSiteId);
  const caseLine = siteId
    ? await prisma.inventoryItem.findFirst({
        where: { productId: input.caseProductId, siteId, site: { companyId } },
        select: { id: true, unit: true, unitCost: true },
      })
    : null;
  if (!siteId || !caseLine) throw new CaseBreakRefused(`There is no ${pack.name} in stock at this branch.`);

  return prisma.$transaction((tx) =>
    openCases(tx, {
      actor,
      siteId,
      cases: input.cases,
      pack: { id: input.caseProductId, name: pack.name, packSize: pack.packSize!, itemId: caseLine.id, unit: caseLine.unit, unitCost: caseLine.unitCost },
      single: pack.packOf!,
      tillRule: atTill,
    }),
  );
}

type Tx = Prisma.TransactionClient;

/**
 * Open `cases` of a case into its singles at a site, in the caller's
 * transaction: one BRK reference, the case's line out and the singles' in.
 * The case's line is locked first, then the singles': the order every
 * movement-writing transaction keeps. `tillRule` refuses when the singles
 * have not run out (a cashier's break on the record).
 */
export async function openCases(
  tx: Tx,
  args: {
    actor: RetailAuditActor;
    siteId: string;
    cases: number;
    pack: { id: string; name: string; packSize: number; itemId: string; unit: string; unitCost: Prisma.Decimal | null };
    single: { id: string; name: string; code: string };
    tillRule?: boolean;
  },
): Promise<BreakCaseResult> {
  const { actor, siteId, pack, single } = args;
  const { companyId } = actor;
  const caseLine = { id: pack.itemId, unit: pack.unit, unitCost: pack.unitCost };
  const singleLines = await tx.inventoryItem.findMany({
    where: { productId: single.id, site: { companyId } },
    orderBy: { createdAt: "asc" },
    select: { id: true, siteId: true, unit: true },
  });
  const singleHere = singleLines.find((line) => line.siteId === siteId) ?? null;

  const singles = args.cases * pack.packSize;
  // What one single of this case cost: the case's cost shared over its bottles.
  const caseShare = caseLine.unitCost === null ? null : money(caseLine.unitCost).dividedBy(pack.packSize);
  const notes = `Opened ${args.cases} × ${pack.name} into ${singles} × ${single.name}`;

  {
    // The document's number and both rows' own first, then the lines: every
    // movement-writing transaction takes them in this order.
    const reference = await reserveIdentifier(tx, { companyId, entity: "RETAIL_CASE_BREAK" });
    const outId = await reserveIdentifier(tx, { companyId, entity: "STOCK_MOVEMENT" });
    const inId = await reserveIdentifier(tx, { companyId, entity: "STOCK_MOVEMENT" });

    await tx.$queryRaw`SELECT "id" FROM "InventoryItem" WHERE "id" = ${caseLine.id} FOR UPDATE`;
    const fresh = await tx.inventoryItem.findUniqueOrThrow({ where: { id: caseLine.id }, select: { currentStock: true } });
    if (fresh.currentStock.lessThan(args.cases)) {
      const left = toNumberOrZero(fresh.currentStock);
      throw new CaseBreakRefused(`There ${left === 1 ? "is" : "are"} only ${formatCount(left)} of ${pack.name} to open.`);
    }

    // The singles' line next, in the order the movements below take them.
    // The till's rule is judged on it under that lock, so two cashiers at
    // none left cannot both open a case.
    let singlesBefore = { onHand: ZERO, unitCost: null as Prisma.Decimal | null };
    if (singleHere) {
      await tx.$queryRaw`SELECT "id" FROM "InventoryItem" WHERE "id" = ${singleHere.id} FOR UPDATE`;
      const row = await tx.inventoryItem.findUniqueOrThrow({ where: { id: singleHere.id }, select: { currentStock: true, unitCost: true } });
      singlesBefore = { onHand: row.currentStock, unitCost: row.unitCost };
      if (args.tillRule && row.currentStock.greaterThanOrEqualTo(1)) throw new CaseBreakRefused(CANNOT_ADJUST, 403);
    }
    const singleCost = blendedCost(singlesBefore, singles, caseShare);

    // A case at a branch means its singles live there: their line is made rather than refused.
    const singleLine =
      singleHere ??
      (await (async () => {
        const place = await tx.stockLocation.findFirst({
          where: { siteId, isActive: true },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });
        if (!place) throw new CaseBreakRefused(`There is nowhere at this branch to put ${single.name}.`);
        return tx.inventoryItem.create({
          data: {
            itemCode: single.code,
            name: single.name,
            category: "RETAIL",
            unit: singleLines[0]?.unit ?? "each",
            siteId,
            locationId: place.id,
            unitCost: caseShare?.toDecimalPlaces(2) ?? null,
            productId: single.id,
          },
          select: { id: true, siteId: true, unit: true },
        });
      })());

    const sourceId = `${pack.id}:${reference}`;
    const out = await recordStockMovement({
      tx,
      referenceId: outId,
      companyId,
      userId: actor.userId,
      itemId: caseLine.id,
      movementType: "ISSUE",
      quantity: quantity(args.cases),
      unit: caseLine.unit,
      notes,
      sourceType: "RETAIL_STOCK_ADJUSTMENT",
      sourceId,
      reason: "CASE_BROKEN",
      reference,
    });
    const into = await recordStockMovement({
      tx,
      referenceId: inId,
      companyId,
      userId: actor.userId,
      itemId: singleLine.id,
      movementType: "RECEIPT",
      quantity: quantity(singles),
      unit: singleLine.unit,
      ...(singleCost ? { unitCost: singleCost } : {}),
      notes,
      sourceType: "RETAIL_STOCK_ADJUSTMENT",
      sourceId,
      reason: "CASE_BROKEN",
      reference,
    });

    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.caseBroken,
      entityType: "Product",
      entityId: pack.id,
      payload: { reference, cases: args.cases, singles, siteId },
    });

    const singleOnHand = toNumberOrZero(into.nextStock);
    return {
      reference,
      cases: args.cases,
      singles,
      caseOnHand: toNumberOrZero(out.nextStock),
      singleOnHand,
      message: brokenToast(args.cases, singleOnHand),
    };
  }
}

/** A live case a till opens when its single runs out (PRD-08, W-12): "Break cases at the till" on, with cases at the site. */
export type TillCase = {
  singleProductId: string;
  single: { id: string; name: string; code: string };
  pack: { id: string; name: string; packSize: number; itemId: string; unit: string; unitCost: Prisma.Decimal | null };
  caseOnHand: number;
};

/**
 * Each single's case at the site that the till may open: live, set to break
 * at the till, with at least one case on hand there; the one with the most
 * cases when there are two. Empty when the shop does not keep cases and
 * singles.
 */
export async function tillCasesFor(
  companyId: string,
  siteId: string,
  singleProductIds: string[],
  casesAndSingles: boolean,
): Promise<Map<string, TillCase>> {
  const found = new Map<string, TillCase>();
  if (!casesAndSingles || singleProductIds.length === 0) return found;
  const lines = await prisma.inventoryItem.findMany({
    where: {
      siteId,
      currentStock: { gte: 1 },
      product: { companyId, packOfId: { in: singleProductIds }, breakAtTill: true, isActive: true, archivedAt: null, packSize: { gte: 2 } },
    },
    orderBy: { currentStock: "desc" },
    select: {
      id: true,
      unit: true,
      unitCost: true,
      currentStock: true,
      product: { select: { id: true, name: true, packSize: true, packOf: { select: { id: true, name: true, code: true } } } },
    },
  });
  for (const line of lines) {
    const single = line.product?.packOf;
    if (!line.product || !single || found.has(single.id)) continue;
    found.set(single.id, {
      singleProductId: single.id,
      single,
      pack: { id: line.product.id, name: line.product.name, packSize: line.product.packSize!, itemId: line.id, unit: line.unit, unitCost: line.unitCost },
      caseOnHand: toNumberOrZero(line.currentStock),
    });
  }
  return found;
}

/**
 * Inside a sale's transaction, before its stock comes off: for each single
 * the sale needs more of than the site has, open as many of its case as the
 * shortfall takes (case line locked first, then the singles'). No journal:
 * it is the same stock on the same account. Returns the BRK references.
 */
export async function breakCasesForSale(
  tx: Tx,
  args: { actor: RetailAuditActor; siteId: string; needs: Array<{ singleItemId: string; quantity: number; tillCase: TillCase }> },
): Promise<string[]> {
  const references: string[] = [];
  for (const need of args.needs) {
    const { pack } = need.tillCase;
    await tx.$queryRaw`SELECT "id" FROM "InventoryItem" WHERE "id" = ${pack.itemId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "InventoryItem" WHERE "id" = ${need.singleItemId} FOR UPDATE`;
    const single = await tx.inventoryItem.findUniqueOrThrow({ where: { id: need.singleItemId }, select: { currentStock: true } });
    const short = need.quantity - toNumberOrZero(single.currentStock);
    if (short <= 0) continue;
    const cases = Math.ceil(short / pack.packSize);
    const opened = await openCases(tx, { actor: args.actor, siteId: args.siteId, cases, pack, single: need.tillCase.single });
    references.push(opened.reference);
  }
  return references;
}
