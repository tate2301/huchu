import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { reserveIdentifier } from "@/lib/id-generator";
import { recordStockMovement } from "@/lib/inventory/stock-movements";
import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { getApprovalLimits } from "@/lib/retail/approvals/limits";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import { approvalFor, ApprovalNeeded, approverSchema, type ApproverInput } from "@/lib/retail/manager-pin";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { isOwnBlobUrl } from "@/lib/uploads/blob-url";
import { formatCount, formatMoney } from "@/lib/workspace/format";

/**
 * Adjust stock (30-stock W-23, STK-04): take stock off for breakage or own
 * use, put found stock on, or set the number on hand after a mistake. One
 * ADJUSTMENT movement under its own ADJ reference, its value at the line's
 * cost; over the shop's limit (Approvals and limits, US$50.00 by default) a
 * manager approves it with their till PIN unless the person holds
 * `retail.adjustments:approve` themselves.
 *
 * The books follow after the commit, keyed by the movement's own id, which is
 * the adjustment's `sourceId` too: a loss Dr Breakage (5410) / Cr Stock
 * (1200), a gain the other way, so STK-03's Reverse finds the journal by
 * movement id and posts its exact opposite.
 */

export const ADJUST_WHYS = ["BROKEN", "OWN_USE", "FOUND", "CORRECTION"] as const;
export type AdjustWhy = (typeof ADJUST_WHYS)[number];

export const adjustInput = z.object({
  productId: z.string().uuid("Pick a product."),
  siteId: z.string().uuid("Pick a site.").optional().nullable(),
  why: z.enum(ADJUST_WHYS, { message: "Say why: broken, own use, found more or a mistake." }),
  n: z.string().max(20),
  note: z.string().max(2000),
  photoUrl: z.string().max(2000).optional().nullable(),
  approver: approverSchema.optional().nullable(),
});

export type AdjustInput = z.infer<typeof adjustInput>;

/** Where Adjust stock's photos are kept, under the company's own prefix. */
export function adjustmentPhotoFolder(companyId: string): string {
  return `companies/${companyId.replace(/[^a-zA-Z0-9-]/g, "-")}/retail/adjustments`;
}

/** The most one line can hold: `currentStock` is Decimal(12, 4). */
const MOST = 99_999_999;

/** A refusal in words, under a field (`n`, `note`) or for the whole sheet. */
export class AdjustRefused extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
    readonly field: "n" | "note" | "photoUrl" | null = null,
  ) {
    super(message);
    this.name = "AdjustRefused";
  }
}

const NO_LINE = "That product has no stock at that site.";

const isWeight = (unit: string) => /^(kg|kgs|kilogram|kilograms)$/i.test(unit.trim());

/** A count as the toast says it: whole numbers grouped, a weight to its decimals. */
const countWords = (value: number) => (Number.isInteger(value) ? formatCount(value) : String(value));

const round2 = (value: number) => Math.round(value * 100) / 100;

/** How many, from what was typed: a number, 0 or more, at most four decimals, whole unless sold by weight. */
export function parseHowMany(text: string, unit: string): number {
  const trimmed = text.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new AdjustRefused(400, "Say how many.", "n");
  const decimals = trimmed.split(".")[1]?.length ?? 0;
  if (decimals > 0 && !isWeight(unit)) throw new AdjustRefused(400, "Say how many, in whole units.", "n");
  if (decimals > 4) throw new AdjustRefused(400, "Say how many, to four decimals at most.", "n");
  const n = Number(trimmed);
  if (n > MOST) throw new AdjustRefused(400, "That is more than a shop holds.", "n");
  return n;
}

/** The signed change the adjustment makes, refused in words when it makes none or takes too much. */
export function adjustmentDelta(why: AdjustWhy, n: number, onHand: number): number {
  const delta = why === "FOUND" ? n : why === "CORRECTION" ? n - onHand : -n;
  if ((why === "BROKEN" || why === "OWN_USE") && n > onHand) {
    throw new AdjustRefused(400, `Only ${countWords(onHand)} on hand.`, "n");
  }
  if (why === "CORRECTION" && delta === 0) throw new AdjustRefused(400, "That is what is on hand already.", "n");
  if (delta === 0) throw new AdjustRefused(400, "Say how many.", "n");
  return Math.round(delta * 10_000) / 10_000;
}

/** The toast: "2 off Amarula Cream 750ml. 11 left." */
export function adjustedToast(why: AdjustWhy, delta: number, name: string, onHand: number): string {
  if (why === "CORRECTION") return `${name} set to ${countWords(onHand)} on hand.`;
  if (delta > 0) return `${countWords(delta)} added to ${name}. ${countWords(onHand)} on hand.`;
  return `${countWords(-delta)} off ${name}. ${countWords(onHand)} left.`;
}

export type AdjustResult = {
  reference: string;
  movementId: string;
  lineId: string;
  delta: number;
  onHand: number;
  /** |change| × cost, to the cent; 0 without a cost. */
  value: number;
  siteId: string;
  itemName: string;
  unitCost: number;
  approvedBy: string | null;
  message: string;
};

type Line = { id: string; siteId: string; unit: string; currentStock: Prisma.Decimal; unitCost: Prisma.Decimal | null };

/** The product's line at the site asked, else at the default site, else its only line. */
async function lineFor(companyId: string, productId: string, siteId: string | null | undefined) {
  const product = await prisma.product.findFirst({
    where: { id: productId, companyId },
    select: {
      name: true,
      inventoryItems: { orderBy: { createdAt: "asc" }, select: { id: true, siteId: true, unit: true, currentStock: true, unitCost: true } },
    },
  });
  if (!product) throw new AdjustRefused(404, NO_LINE);
  const lines: Line[] = product.inventoryItems;
  let line: Line | undefined;
  if (siteId) {
    line = lines.find((row) => row.siteId === siteId);
  } else {
    const profile = await prisma.retailShopProfile.findUnique({ where: { companyId }, select: { defaultSiteId: true } });
    line = lines.find((row) => row.siteId === profile?.defaultSiteId) ?? (lines.length === 1 ? lines[0] : undefined);
  }
  if (!line) throw new AdjustRefused(404, NO_LINE);
  return { name: product.name, line };
}

/**
 * Takes the stock off or puts it on, in one transaction under the line's
 * lock. The approval is checked before it: the PIN's attempt counter is
 * written outside the act, so a wrong PIN still counts.
 */
export async function adjustStock(input: {
  actor: RetailAuditActor;
  productId: string;
  siteId?: string | null;
  why: AdjustWhy;
  n: string;
  note: string;
  photoUrl?: string | null;
  approver?: ApproverInput | null;
}): Promise<AdjustResult> {
  const { actor } = input;
  const { name, line } = await lineFor(actor.companyId, input.productId, input.siteId);
  const n = parseHowMany(input.n, line.unit);
  const note = input.note.trim();
  if (!note || note.length > 500) throw new AdjustRefused(400, "Say what happened.", "note");
  // Only a photo this shop uploaded through Adjust stock's own photo route.
  if (input.photoUrl && !isOwnBlobUrl(input.photoUrl, adjustmentPhotoFolder(actor.companyId))) {
    throw new AdjustRefused(400, "Add the photo again; that one did not come from here.", "photoUrl");
  }

  const cost = line.unitCost === null ? 0 : toNumberOrZero(line.unitCost);
  const valueOf = (delta: number) => round2(Math.abs(delta) * cost);
  const limits = await getApprovalLimits(actor.companyId);
  const limit = toNumberOrZero(limits.adjustmentPinOver);
  const reason = `Over ${formatMoney(limit)} needs a manager PIN.`;
  const holdsApprove = canRetailRoleDo(actor.userRole, "retail.adjustments", "approve");

  // Judged on what is on hand now; checked again under the lock below.
  const planned = valueOf(adjustmentDelta(input.why, n, toNumberOrZero(line.currentStock)));
  const approval = await approvalFor({
    companyId: actor.companyId,
    actorRole: actor.userRole,
    decision: planned > limit ? { needsApprover: true, reason } : { needsApprover: false },
    approver: input.approver ?? null,
    can: ["retail.adjustments", "approve"],
  });
  const approvedBy = approval?.name ?? (holdsApprove ? (actor.userName ?? null) : null);

  return prisma.$transaction(async (tx) => {
    // The document's number and the row's own first, then the line: every
    // movement-writing transaction takes them in this order.
    const reference = await reserveIdentifier(tx, { companyId: actor.companyId, entity: "RETAIL_STOCK_ADJUSTMENT" });
    const referenceId = await reserveIdentifier(tx, { companyId: actor.companyId, entity: "STOCK_MOVEMENT" });
    await tx.$queryRaw`SELECT "id" FROM "InventoryItem" WHERE "id" = ${line.id} FOR UPDATE`;
    const fresh = await tx.inventoryItem.findUniqueOrThrow({ where: { id: line.id }, select: { currentStock: true } });
    const before = toNumberOrZero(fresh.currentStock);
    const delta = adjustmentDelta(input.why, n, before);
    const value = valueOf(delta);
    if (value > limit && !approval && !holdsApprove) throw new ApprovalNeeded(reason);

    const id = randomUUID();
    const { nextStock } = await recordStockMovement({
      tx,
      id,
      referenceId,
      companyId: actor.companyId,
      userId: actor.userId,
      itemId: line.id,
      movementType: "ADJUSTMENT",
      quantity: delta,
      unit: line.unit,
      notes: note,
      photoUrl: input.photoUrl ?? null,
      approvedBy,
      sourceType: "RETAIL_STOCK_ADJUSTMENT",
      // The adjustment is its own document: Reverse finds its journal by this id.
      sourceId: id,
      reason: input.why,
      reference,
    });
    const onHand = toNumberOrZero(nextStock);

    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.stockAdjusted,
      entityType: "Product",
      entityId: input.productId,
      reason: note,
      payload: {
        reference,
        // Reverse values the opposite from this while the posting waits.
        movementId: id,
        why: input.why,
        delta,
        from: before,
        to: onHand,
        value: value.toFixed(2),
        siteId: line.siteId,
        approvedBy,
      },
    });

    return {
      reference,
      movementId: id,
      lineId: line.id,
      delta,
      onHand,
      value,
      siteId: line.siteId,
      itemName: name,
      unitCost: cost,
      approvedBy,
      message: adjustedToast(input.why, delta, name, onHand),
    };
  });
}

/**
 * What the adjustment posts, after the commit: a loss Dr Breakage / Cr Stock
 * (`invertDirection`), a gain the other way, at its value; nothing without
 * one. The caller hands it to `postRetailJournal`.
 */
export function adjustmentJournal(result: AdjustResult, actor: RetailAuditActor) {
  if (result.value <= 0) return null;
  const loss = result.delta < 0;
  return {
    companyId: actor.companyId,
    sourceType: "RETAIL_STOCK_ADJUSTMENT" as const,
    sourceId: result.movementId,
    sourceSubtype: loss ? "LOSS" : "GAIN",
    siteId: result.siteId,
    entryDate: new Date(),
    description: `Stock adjustment ${result.reference}`,
    createdById: actor.userId,
    actorRole: actor.userRole ?? null,
    amount: result.value,
    netAmount: result.value,
    grossAmount: result.value,
    taxAmount: 0,
    invertDirection: loss,
    inventory: {
      lines: [
        {
          inventoryItemId: result.lineId,
          itemName: result.itemName,
          quantity: Math.abs(result.delta),
          unitCost: result.unitCost,
          totalCost: result.value,
        },
      ],
      totalCost: result.value,
    },
  };
}
