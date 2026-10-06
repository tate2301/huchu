import { Prisma } from "@prisma/client";
import { z } from "zod";

import { recordStockMovement } from "@/lib/inventory/stock-movements";
import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { auditRecordEdited, type RetailAuditActor } from "@/lib/retail/audit";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { COVER_WINDOW_DAYS } from "@/lib/retail/stock/levels";
import { setStockLineLevels } from "@/lib/retail/stock/lines";
import { loadOnHand } from "@/lib/retail/stock/on-hand";
import { perDayOf } from "@/lib/retail/stock/reorder";

/**
 * Changing a stock line (30-stock 4.3, 4.4; STK-02): one line's levels, shelf
 * and place from its PATCH, and many lines' "Reorder at" at once from the
 * Change reorder levels sheet. Each changed value is a `RETAIL_RECORD.EDITED`
 * on the product, so its record's Activity says what changed.
 */

type Tx = Prisma.TransactionClient;

export const LINE_NOT_FOUND = "That stock line is not this shop’s.";
export const REORDER_AT_RULE = "Reorder at is a number, 0 or more.";
const REORDER_RULE = "Reorder is a number above 0.";
const SHELF_RULE = "A shelf is 60 characters at most.";
const PLACE_RULE = "That place is not at this site.";

/** A refusal with its status and, for a 400, the field it belongs under. */
export class StockLineRefusal extends Error {
  constructor(
    readonly status: 400 | 404,
    message: string,
    readonly field: string | null = null,
  ) {
    super(message);
  }
}

/** A number typed or sent: 12, "12", or null to clear it. */
const amount = (rule: string, check: (value: number) => boolean) =>
  z
    .union([z.number(), z.string().trim().regex(/^\d+(\.\d+)?$/).transform(Number), z.null()], { error: rule })
    .refine((value) => value === null || (Number.isFinite(value) && check(value)), { error: rule });

const reorderAt = amount(REORDER_AT_RULE, (value) => value >= 0);

export const stockLinePatch = z.object({
  reorderAt: reorderAt.optional(),
  reorderQty: amount(REORDER_RULE, (value) => value > 0).optional(),
  shelf: z
    .union([z.string().trim().max(60, { error: SHELF_RULE }), z.null()], { error: SHELF_RULE })
    .transform((value) => (value === "" ? null : value))
    .optional(),
  placeId: z.string().uuid({ error: PLACE_RULE }).optional(),
});
export type StockLinePatch = z.infer<typeof stockLinePatch>;

export const reorderLevelsBody = z.object({
  levels: z
    .array(z.object({ lineId: z.string().uuid({ error: LINE_NOT_FOUND }), reorderAt }), { error: "Tick at least one product." })
    .min(1, { error: "Tick at least one product." })
    .max(500, { error: "Change 500 or fewer at a time." }),
});

/** Zod's issues as the sheet's field messages: `reorderAt`, or `levels.<i>` for a line. */
export function stockLineFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const [first, index] = issue.path;
    const key = first === "levels" && typeof index === "number" ? `levels.${index}` : String(first ?? "body");
    out[key] ??= issue.message;
  }
  return out;
}

export type StockLineChange = { field: string; label: string; from: string | null; to: string | null };

const figure = (value: Prisma.Decimal | null) => (value === null ? null : String(toNumberOrZero(value)));

/**
 * Change one line (PATCH): any of Reorder at, Reorder, Shelf and Place. A
 * place is one of the line's own site's open places; moving the line there is
 * a `PLACE_MOVE` in its ledger (the whole line moves, as a place holds no
 * count of its own).
 */
export async function updateStockLine(tx: Tx, actor: RetailAuditActor, lineId: string, patch: StockLinePatch): Promise<StockLineChange[]> {
  const line = await tx.inventoryItem.findFirst({
    where: { id: lineId, site: { companyId: actor.companyId }, product: { is: { companyId: actor.companyId } } },
    select: {
      id: true,
      siteId: true,
      unit: true,
      currentStock: true,
      minStock: true,
      reorderQty: true,
      shelf: true,
      productId: true,
      location: { select: { id: true, name: true } },
    },
  });
  if (!line) throw new StockLineRefusal(404, LINE_NOT_FOUND);

  const changes: StockLineChange[] = [];
  const note = (field: string, label: string, from: string | null, to: string | null) => {
    if (from !== to) changes.push({ field, label, from, to });
  };
  if (patch.reorderAt !== undefined) note("reorderAt", "Reorder at", figure(line.minStock), patch.reorderAt === null ? null : String(patch.reorderAt));
  if (patch.reorderQty !== undefined) note("reorderQty", "Reorder", figure(line.reorderQty), patch.reorderQty === null ? null : String(patch.reorderQty));
  if (patch.shelf !== undefined) note("shelf", "Shelf", line.shelf, patch.shelf);

  await setStockLineLevels(tx, line.id, { reorderAt: patch.reorderAt, reorderQty: patch.reorderQty, shelf: patch.shelf });

  if (patch.placeId !== undefined && patch.placeId !== line.location.id) {
    const place = await tx.stockLocation.findFirst({
      where: { id: patch.placeId, siteId: line.siteId, isActive: true },
      select: { id: true, name: true },
    });
    if (!place) throw new StockLineRefusal(400, PLACE_RULE, "placeId");
    if (line.currentStock.isZero()) {
      await tx.inventoryItem.update({ where: { id: line.id }, data: { locationId: place.id } });
    } else {
      // The ledger moves a whole line between places: its location changes, its count does not.
      await recordStockMovement({
        tx,
        companyId: actor.companyId,
        userId: actor.userId,
        itemId: line.id,
        movementType: "TRANSFER",
        quantity: line.currentStock,
        unit: line.unit,
        toLocationId: place.id,
        reason: "PLACE_MOVE",
        reference: null,
        notes: `Moved to ${place.name}`,
        sourceType: "RETAIL_STOCK_TRANSFER",
        sourceId: line.id,
      });
    }
    note("place", "Place", line.location.name, place.name);
  }

  for (const change of changes) {
    await auditRecordEdited(tx, {
      actor,
      entityType: "Product",
      entityId: line.productId!,
      field: change.field,
      label: change.label,
      from: change.from,
      to: change.to,
      kind: change.field === "reorderAt" || change.field === "reorderQty" ? "count" : "text",
    });
  }
  return changes;
}

/**
 * Save many lines' "Reorder at" (PUT): all of them or none. A line that is
 * not the shop's refuses the lot; only lines whose level changed write.
 */
export async function saveReorderLevels(
  tx: Tx,
  actor: RetailAuditActor,
  levels: Array<{ lineId: string; reorderAt: number | null }>,
): Promise<number> {
  const ids = [...new Set(levels.map((level) => level.lineId))];
  const lines = await tx.inventoryItem.findMany({
    where: { id: { in: ids }, site: { companyId: actor.companyId }, product: { is: { companyId: actor.companyId } } },
    select: { id: true, minStock: true, productId: true },
  });
  if (lines.length !== ids.length) throw new StockLineRefusal(404, LINE_NOT_FOUND);
  const byId = new Map(lines.map((line) => [line.id, line]));

  let saved = 0;
  for (const level of levels) {
    const line = byId.get(level.lineId)!;
    const from = figure(line.minStock);
    const to = level.reorderAt === null ? null : String(level.reorderAt);
    if (from === to) continue;
    await setStockLineLevels(tx, line.id, { reorderAt: level.reorderAt });
    await auditRecordEdited(tx, {
      actor,
      entityType: "Product",
      entityId: line.productId!,
      field: "reorderAt",
      label: "Reorder at",
      from,
      to,
      kind: "count",
    });
    line.minStock = level.reorderAt === null ? null : new Prisma.Decimal(level.reorderAt);
    saved += 1;
  }
  return saved;
}

export type ReorderLine = {
  lineId: string;
  productId: string;
  product: string;
  siteId: string;
  site: string;
  unit: string;
  /** Net units sold a day at this site over the last 30. */
  perDay: number;
  reorderAt: number | null;
  /** What one cost, for roles that may see cost. */
  unitCost?: number | null;
  /** The supplier's lead time in days; 0 with no supplier or none set. */
  leadDays: number;
  /** Singles in the product's case, when it comes in one. */
  caseSize: number | null;
};

/** What the Change reorder levels sheet works from, for the lines asked, in the order asked. */
export async function readReorderLines(companyId: string, lineIds: string[], role: string | null | undefined): Promise<ReorderLine[]> {
  const lines = await loadOnHand(companyId, { lineIds });
  if (lines.length === 0) return [];
  const products = await prisma.product.findMany({
    where: { companyId, id: { in: [...new Set(lines.map((line) => line.productId))] } },
    select: {
      id: true,
      supplier: { select: { leadTimeDays: true } },
      packs: {
        where: { archivedAt: null, isActive: true, packSize: { gt: 1 } },
        orderBy: { packSize: "asc" },
        select: { packSize: true },
        take: 1,
      },
    },
  });
  const byProduct = new Map(products.map((product) => [product.id, product]));
  const seeCost = canRetailRoleDo(role, "retail.catalog", "view-cost");
  const order = new Map(lineIds.map((id, index) => [id, index]));

  return lines
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((line): ReorderLine => {
      const product = byProduct.get(line.productId);
      return {
        lineId: line.id,
        productId: line.productId,
        product: line.product,
        siteId: line.siteId,
        site: line.site,
        unit: line.unit,
        perDay: Math.round(perDayOf(line.sold30, COVER_WINDOW_DAYS) * 100) / 100,
        reorderAt: line.reorderAt,
        ...(seeCost ? { unitCost: line.unitCost } : {}),
        leadDays: product?.supplier?.leadTimeDays ?? 0,
        caseSize: product?.packs[0]?.packSize ?? null,
      };
    });
}
