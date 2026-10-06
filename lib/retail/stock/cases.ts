import { z } from "zod";

import { reserveIdentifier } from "@/lib/id-generator";
import { recordStockMovement } from "@/lib/inventory/stock-movements";
import { money, quantity, toNumberOrZero } from "@/lib/money";
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
 * bottles.
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
    if (!canRetailRoleDo(actor.userRole, "retail.sell", "create")) throw new CaseBreakRefused("Your role cannot adjust stock", 403);
    const shift = await prisma.retailShift.findFirst({
      where: { companyId, cashierId: actor.userId, status: "OPEN", ...(input.siteId ? { siteId: input.siteId } : {}) },
      orderBy: { openedAt: "desc" },
      select: { siteId: true },
    });
    if (!shift) throw new CaseBreakRefused("Your role cannot adjust stock", 403);
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

  const single = pack.packOf;
  const singleLines = await prisma.inventoryItem.findMany({
    where: { productId: single.id, site: { companyId } },
    orderBy: { createdAt: "asc" },
    select: { id: true, siteId: true, unit: true, currentStock: true },
  });
  const singleHere = singleLines.find((line) => line.siteId === siteId) ?? null;
  if (atTill && singleHere && singleHere.currentStock.greaterThanOrEqualTo(1)) {
    throw new CaseBreakRefused("Your role cannot adjust stock", 403);
  }

  const singles = input.cases * pack.packSize;
  const singleCost = caseLine.unitCost === null ? null : money(caseLine.unitCost).dividedBy(pack.packSize).toDecimalPlaces(2);
  const notes = `Opened ${input.cases} × ${pack.name} into ${singles} × ${single.name}`;

  return prisma.$transaction(async (tx) => {
    // The document's number and both rows' own first, then the lines: every
    // movement-writing transaction takes them in this order.
    const reference = await reserveIdentifier(tx, { companyId, entity: "RETAIL_CASE_BREAK" });
    const outId = await reserveIdentifier(tx, { companyId, entity: "STOCK_MOVEMENT" });
    const inId = await reserveIdentifier(tx, { companyId, entity: "STOCK_MOVEMENT" });

    await tx.$queryRaw`SELECT "id" FROM "InventoryItem" WHERE "id" = ${caseLine.id} FOR UPDATE`;
    const fresh = await tx.inventoryItem.findUniqueOrThrow({ where: { id: caseLine.id }, select: { currentStock: true } });
    if (fresh.currentStock.lessThan(input.cases)) {
      const left = toNumberOrZero(fresh.currentStock);
      throw new CaseBreakRefused(`There ${left === 1 ? "is" : "are"} only ${formatCount(left)} of ${pack.name} to open.`);
    }

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
            unitCost: singleCost,
            productId: single.id,
          },
          select: { id: true, siteId: true, unit: true, currentStock: true },
        });
      })());

    const sourceId = `${input.caseProductId}:${reference}`;
    const out = await recordStockMovement({
      tx,
      referenceId: outId,
      companyId,
      userId: actor.userId,
      itemId: caseLine.id,
      movementType: "ISSUE",
      quantity: quantity(input.cases),
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
      entityId: input.caseProductId,
      payload: { reference, cases: input.cases, singles, siteId },
    });

    const singleOnHand = toNumberOrZero(into.nextStock);
    return {
      reference,
      cases: input.cases,
      singles,
      caseOnHand: toNumberOrZero(out.nextStock),
      singleOnHand,
      message: brokenToast(input.cases, singleOnHand),
    };
  });
}
