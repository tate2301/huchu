import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { createJournalEntryFromSource } from "@/lib/accounting/posting";
import { recordStockMovement } from "@/lib/inventory/stock-movements";
import { multiplyMoney, quantity, sumMoney, toNumberOrZero, ZERO } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { auditAmount, auditRecordEdited, RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";

import {
  changedToast,
  isCountedUnit,
  onlySentWords,
  onlyWords,
  receivedToast,
  type ShortChoice,
  type ShortLine,
} from "./transfer-words";
import { cancelTransfers, TransferRefusal, type TransferActor } from "./transfers";

/**
 * A transfer after it left (30-stock W-24 steps 3–6, 4.5): the other site
 * counts in what came, the lines change while nothing has been received, the
 * rail's To, vehicle, driver and note change, and one transfer is called off.
 * Every change locks the transfer row first, so a receipt and a change or a
 * cancel cannot land on each other.
 */

type Tx = Prisma.TransactionClient;

/** A quantity as typed: a number, at most four places. */
const QUANTITY = /^\d+(\.\d{1,4})?$/;

async function lockTransfer(tx: Tx, companyId: string, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "RetailStockTransfer" WHERE "id" = ${id} AND "companyId" = ${companyId} FOR UPDATE`;
  const transfer = await tx.retailStockTransfer.findFirst({
    where: { id, companyId },
    select: {
      id: true,
      transferNo: true,
      status: true,
      fromSiteId: true,
      toSiteId: true,
      driver: true,
      vehicle: true,
      note: true,
      fromSite: { select: { name: true } },
      toSite: { select: { name: true } },
      lines: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          productId: true,
          fromItemId: true,
          toItemId: true,
          quantitySent: true,
          quantityReceived: true,
          quantityLost: true,
          unitCost: true,
          product: { select: { name: true, code: true } },
          fromItem: { select: { unit: true, name: true } },
        },
      },
    },
  });
  if (!transfer) throw new TransferRefusal(404, "That transfer is not this shop’s.");
  return transfer;
}

type Locked = Awaited<ReturnType<typeof lockTransfer>>;

const toComeOf = (line: Locked["lines"][number]) => line.quantitySent.minus(line.quantityReceived).minus(line.quantityLost);
const touched = (transfer: Locked) =>
  transfer.lines.some((line) => line.quantityReceived.greaterThan(0) || line.quantityLost.greaterThan(0));

/** A transfer no longer on the way, in the words its number reads in. */
function closedRefusal(transfer: Locked): TransferRefusal {
  return new TransferRefusal(
    409,
    transfer.status === "CANCELLED" ? `${transfer.transferNo} was cancelled.` : `${transfer.transferNo} has been received.`,
  );
}

/* ── Rail edits (PATCH /api/v2/retail/stock/transfers/[id]) ───────────────── */

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `Keep ${label} to ${max} characters.`)
    .nullable()
    .optional()
    .transform((value) => (value === undefined ? undefined : value || null));

export const transferPatch = z
  .object({
    toSiteId: z.string().uuid("Pick one of this shop’s open sites.").optional(),
    vehicle: optionalText(80, "the vehicle"),
    driver: optionalText(80, "the driver"),
    note: optionalText(500, "the note"),
  })
  .strict();

export type TransferPatch = z.infer<typeof transferPatch>;

const LABELS = { toSiteId: "To", vehicle: "Vehicle", driver: "Driver", note: "Note" } as const;

/**
 * Changes what the rail shows (W-24 step 6, W-62): To while nothing has been
 * received ("Part of it has been received, so it is going to Borrowdale."),
 * and the vehicle, driver and note at any time. One `RETAIL_RECORD.EDITED`
 * per field that changed; returns the fields that did.
 */
export async function patchTransfer(actor: RetailAuditActor, id: string, patch: TransferPatch): Promise<string[]> {
  const { companyId } = actor;
  return prisma.$transaction(async (tx) => {
    const transfer = await lockTransfer(tx, companyId, id);
    const changed: string[] = [];

    if (patch.toSiteId !== undefined && patch.toSiteId !== transfer.toSiteId) {
      if (transfer.status !== "ON_THE_WAY" || touched(transfer)) {
        throw new TransferRefusal(409, `Part of it has been received, so it is going to ${transfer.toSite.name}.`);
      }
      if (patch.toSiteId === transfer.fromSiteId) {
        throw new TransferRefusal(400, "Pick a different site.", { toSiteId: "Pick a different site." });
      }
      const to = await tx.site.findFirst({ where: { id: patch.toSiteId, companyId, isActive: true }, select: { id: true, name: true } });
      if (!to) throw new TransferRefusal(400, "Pick one of this shop’s open sites.", { toSiteId: "Pick one of this shop’s open sites." });
      await tx.retailStockTransfer.update({ where: { id }, data: { toSiteId: to.id } });
      await auditRecordEdited(tx, {
        actor,
        entityType: "RetailStockTransfer",
        entityId: id,
        field: "toSiteId",
        label: LABELS.toSiteId,
        from: transfer.toSite.name,
        to: to.name,
      });
      changed.push("toSiteId");
    }

    for (const field of ["vehicle", "driver", "note"] as const) {
      const next = patch[field];
      if (next === undefined || next === transfer[field]) continue;
      await tx.retailStockTransfer.update({ where: { id }, data: { [field]: next } });
      await auditRecordEdited(tx, {
        actor,
        entityType: "RetailStockTransfer",
        entityId: id,
        field,
        label: LABELS[field],
        from: transfer[field],
        to: next,
      });
      changed.push(field);
    }
    return changed;
  });
}

/* ── Change the lines (PUT /api/v2/retail/stock/transfers/[id]/lines) ─────── */

export const transferLinesInput = z.object({
  lines: z
    .array(z.object({ lineId: z.string().uuid("Pick a product from the list."), quantity: z.string().trim() }), {
      message: "Add what goes.",
    })
    .min(1, "Add what goes.")
    .max(200, "Send at most 200 lines at a time."),
});

export type TransferLinesInput = z.infer<typeof transferLinesInput>;

export type ChangedTransfer = { id: string; transferNo: string; units: number; message: string };

/**
 * Changes what is on the way while nothing has been received (W-24 step 4):
 * each line's difference leaves From (`ISSUE`, `TRANSFER_OUT`) or comes back
 * (`RECEIPT`, `TRANSFER_BACK`); a line taken off comes back whole, a line
 * added leaves. A line may go up to what is on hand plus what it already
 * sends. One `RETAIL_STOCK_TRANSFER.CHANGED` with the units now on the way.
 */
export async function changeTransferLines(actor: RetailAuditActor, id: string, input: TransferLinesInput): Promise<ChangedTransfer> {
  const { companyId } = actor;
  return prisma.$transaction(async (tx) => {
    const transfer = await lockTransfer(tx, companyId, id);
    if (transfer.status !== "ON_THE_WAY") throw closedRefusal(transfer);
    if (touched(transfer)) throw new TransferRefusal(409, "Part of it has been received. Receive the rest or cancel it.");

    const fromName = transfer.fromSite.name;
    const items = await tx.inventoryItem.findMany({
      where: { id: { in: input.lines.map((line) => line.lineId) }, site: { companyId } },
      select: { id: true, siteId: true, productId: true, unit: true, currentStock: true, unitCost: true, name: true },
    });
    const itemById = new Map(items.map((item) => [item.id, item]));
    const existingByProduct = new Map(transfer.lines.map((line) => [line.productId, line]));

    const errors: Record<string, string> = {};
    const seen = new Set<string>();
    const wanted: Array<{ item: (typeof items)[number]; productId: string; quantity: Prisma.Decimal }> = [];
    input.lines.forEach((line, index) => {
      const key = `lines.${index}`;
      const item = itemById.get(line.lineId);
      if (!item || !item.productId || item.siteId !== transfer.fromSiteId) {
        errors[key] = `That product is not kept at ${fromName}.`;
        return;
      }
      if (seen.has(item.productId)) {
        errors[key] = "That product is on the list twice.";
        return;
      }
      seen.add(item.productId);
      if (!QUANTITY.test(line.quantity) || quantity(line.quantity).lessThanOrEqualTo(0)) {
        errors[key] = "Type how many to send.";
        return;
      }
      const units = quantity(line.quantity);
      if (isCountedUnit(item.unit) && !units.isInteger()) {
        errors[key] = "Send whole ones.";
        return;
      }
      const already = existingByProduct.get(item.productId);
      const free = item.currentStock.plus(already && already.fromItemId === item.id ? already.quantitySent : ZERO);
      if (units.greaterThan(free)) {
        errors[key] = onlyWords(free.toNumber(), fromName);
        return;
      }
      wanted.push({ item, productId: item.productId, quantity: units });
    });
    if (Object.keys(errors).length > 0) {
      throw new TransferRefusal(400, Object.values(errors)[0] ?? "Check the lines.", errors);
    }

    const back = async (itemId: string, unit: string, units: Prisma.Decimal, lineId: string) =>
      recordStockMovement({
        tx,
        companyId,
        userId: actor.userId,
        itemId,
        movementType: "RECEIPT",
        quantity: units,
        unit,
        reason: "TRANSFER_BACK",
        reference: transfer.transferNo,
        notes: `Back from ${transfer.transferNo}`,
        sourceType: "RETAIL_STOCK_TRANSFER",
        sourceId: `${transfer.id}:${lineId}:back`,
      });
    const out = async (itemId: string, unit: string, units: Prisma.Decimal, lineId: string, name: string) => {
      try {
        await recordStockMovement({
          tx,
          companyId,
          userId: actor.userId,
          itemId,
          movementType: "ISSUE",
          quantity: units,
          unit,
          reason: "TRANSFER_OUT",
          reference: transfer.transferNo,
          notes: `Transfer to ${transfer.toSite.name}`,
          sourceType: "RETAIL_STOCK_TRANSFER",
          sourceId: `${transfer.id}:${lineId}`,
        });
      } catch (error) {
        if (error instanceof Error && error.message === "Insufficient stock.") {
          throw new TransferRefusal(409, `${name} changed while you were changing the lines. Check how many are left and save again.`);
        }
        throw error;
      }
    };

    const wantedByProduct = new Map(wanted.map((line) => [line.productId, line]));
    // What comes back first, so the stock it frees can go out on another line.
    for (const line of transfer.lines) {
      const next = wantedByProduct.get(line.productId);
      if (!next || next.item.id !== line.fromItemId) {
        await back(line.fromItemId, line.fromItem.unit, line.quantitySent, line.id);
        await tx.retailStockTransferLine.delete({ where: { id: line.id } });
      } else if (next.quantity.lessThan(line.quantitySent)) {
        await back(line.fromItemId, line.fromItem.unit, line.quantitySent.minus(next.quantity), line.id);
        await tx.retailStockTransferLine.update({ where: { id: line.id }, data: { quantitySent: next.quantity } });
      }
    }
    for (const next of wanted) {
      const line = existingByProduct.get(next.productId);
      if (line && line.fromItemId === next.item.id) {
        if (next.quantity.greaterThan(line.quantitySent)) {
          await out(line.fromItemId, line.fromItem.unit, next.quantity.minus(line.quantitySent), line.id, next.item.name);
          await tx.retailStockTransferLine.update({ where: { id: line.id }, data: { quantitySent: next.quantity } });
        }
        continue;
      }
      const created = await tx.retailStockTransferLine.create({
        data: {
          companyId,
          transferId: transfer.id,
          productId: next.productId,
          fromItemId: next.item.id,
          quantitySent: next.quantity,
          unitCost: next.item.unitCost ?? 0,
        },
        select: { id: true },
      });
      await out(next.item.id, next.item.unit, next.quantity, created.id, next.item.name);
    }

    const units = wanted.reduce((sum, line) => sum.plus(line.quantity), ZERO).toNumber();
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.transferChanged,
      entityType: "RetailStockTransfer",
      entityId: transfer.id,
      payload: { transferNo: transfer.transferNo, lines: wanted.length, units },
    });
    return { id: transfer.id, transferNo: transfer.transferNo, units, message: changedToast(transfer.transferNo, units) };
  });
}

/* ── Receive (POST /api/v2/retail/stock/transfers/[id]/receive) ───────────── */

export const receiveInput = z.object({
  lines: z
    .array(z.object({ id: z.string().uuid("That line is not on this transfer."), received: z.string().trim() }), {
      message: "Count what came.",
    })
    .min(1, "Count what came.")
    .max(200),
  short: z.enum(["STILL_COMING", "LOST"], { message: "Say what happened to what is short." }),
});

export type ReceiveInput = z.infer<typeof receiveInput>;

export type ReceivedTransfer = {
  id: string;
  transferNo: string;
  status: "ON_THE_WAY" | "RECEIVED";
  to: { id: string; name: string };
  received: number;
  lost: number;
  stillComing: number;
  /** The loss written off, at cost. */
  lostValue: number;
  message: string;
};

/**
 * The receiving site's stock line for a product: the one it already keeps,
 * or a new one (W-24 step 3) coded with the product's code, in the line's
 * unit and cost, at the site's first open place, with no reorder level.
 */
async function lineAtSite(
  tx: Tx,
  siteId: string,
  line: Locked["lines"][number],
): Promise<{ id: string; unit: string; created: boolean }> {
  const kept = await tx.inventoryItem.findFirst({
    where: { siteId, productId: line.productId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, unit: true },
  });
  if (kept) return { ...kept, created: false };

  const place =
    (await tx.stockLocation.findFirst({
      where: { siteId, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    })) ??
    (await tx.stockLocation.create({ data: { siteId, code: "SHOP-FLOOR", name: "Shop floor" }, select: { id: true } }));
  const code = line.product.code;
  const taken = await tx.inventoryItem.findFirst({ where: { siteId, itemCode: code }, select: { id: true } });
  const created = await tx.inventoryItem.create({
    data: {
      itemCode: taken ? `${code}-${line.id.slice(0, 8)}` : code,
      name: line.product.name,
      category: "OTHER",
      unit: line.fromItem.unit,
      siteId,
      locationId: place.id,
      productId: line.productId,
      unitCost: line.unitCost,
    },
    select: { id: true, unit: true },
  });
  return { ...created, created: true };
}

/**
 * Counts in what came at the site it went to (W-24 step 3). Each received
 * figure is 0 up to what is still to come; received units go on the To
 * site's line (made if it keeps none) with a `TRANSFER_IN` receipt. What is
 * short either stays on the way (`STILL_COMING`: "Part received, 2 to come",
 * received again later) or is written off (`LOST`: the line's lost figure
 * and a `RETAIL_STOCK_ADJUSTMENT` loss journal at its cost). With nothing
 * left to come the transfer is Received.
 */
export async function receiveTransfer(actor: TransferActor, id: string, input: ReceiveInput): Promise<ReceivedTransfer> {
  const { companyId } = actor;
  const done = await prisma.$transaction(async (tx) => {
    const transfer = await lockTransfer(tx, companyId, id);
    if (transfer.status !== "ON_THE_WAY") {
      throw new TransferRefusal(
        409,
        transfer.status === "CANCELLED" ? `${transfer.transferNo} was cancelled.` : `${transfer.transferNo} has already been received.`,
      );
    }

    const lineById = new Map(transfer.lines.map((line) => [line.id, line]));
    const errors: Record<string, string> = {};
    const came = new Map<string, Prisma.Decimal>();
    input.lines.forEach((entry, index) => {
      const key = `lines.${index}`;
      const line = lineById.get(entry.id);
      if (!line || toComeOf(line).lessThanOrEqualTo(0)) {
        errors[key] = "That line is not on the way any more.";
        return;
      }
      if (came.has(line.id)) {
        errors[key] = "That line is on the list twice.";
        return;
      }
      if (!QUANTITY.test(entry.received)) {
        errors[key] = "Type how many came, 0 if none.";
        return;
      }
      const units = quantity(entry.received);
      if (isCountedUnit(line.fromItem.unit) && !units.isInteger()) {
        errors[key] = "Count whole ones.";
        return;
      }
      const toCome = toComeOf(line);
      if (units.greaterThan(toCome)) {
        errors[key] = onlySentWords(line.quantitySent.toNumber(), toCome.toNumber());
        return;
      }
      came.set(line.id, units);
    });
    if (Object.keys(errors).length > 0) {
      throw new TransferRefusal(400, Object.values(errors)[0] ?? "Check what came.", errors);
    }

    let received = ZERO;
    let lost = ZERO;
    let stillComing = ZERO;
    const short: ShortLine[] = [];
    const lostLines: Array<{ itemId: string; name: string; units: Prisma.Decimal; unitCost: Prisma.Decimal }> = [];

    for (const line of transfer.lines) {
      const toCome = toComeOf(line);
      if (toCome.lessThanOrEqualTo(0)) continue;
      // A line the sheet did not send came with nothing.
      const units = came.get(line.id) ?? ZERO;
      const gap = toCome.minus(units);
      const data: Prisma.RetailStockTransferLineUpdateInput = {};

      if (units.greaterThan(0)) {
        const target = await lineAtSite(tx, transfer.toSiteId, line);
        await recordStockMovement({
          tx,
          companyId,
          userId: actor.userId,
          itemId: target.id,
          movementType: "RECEIPT",
          quantity: units,
          unit: target.unit,
          ...(target.created ? { unitCost: line.unitCost } : {}),
          reason: "TRANSFER_IN",
          reference: transfer.transferNo,
          notes: `Transfer from ${transfer.fromSite.name}`,
          sourceType: "RETAIL_STOCK_TRANSFER",
          sourceId: `${transfer.id}:${line.id}:in`,
        });
        data.quantityReceived = line.quantityReceived.plus(units);
        data.toItem = { connect: { id: target.id } };
        received = received.plus(units);
      }
      if (gap.greaterThan(0)) {
        short.push({ name: line.product.name, short: gap.toNumber() });
        if (input.short === "LOST") {
          data.quantityLost = line.quantityLost.plus(gap);
          lost = lost.plus(gap);
          lostLines.push({ itemId: line.fromItemId, name: line.product.name, units: gap, unitCost: line.unitCost });
        } else {
          stillComing = stillComing.plus(gap);
        }
      }
      if (Object.keys(data).length > 0) await tx.retailStockTransferLine.update({ where: { id: line.id }, data });
    }

    if (received.isZero() && lost.isZero()) {
      throw new TransferRefusal(400, "Nothing came yet. Type how many came, or mark what is short lost.");
    }

    const complete = stillComing.isZero();
    if (complete) {
      await tx.retailStockTransfer.update({
        where: { id },
        data: { status: "RECEIVED", receivedAt: new Date(), receivedById: actor.userId },
      });
    }
    const lostValue = sumMoney(lostLines.map((line) => multiplyMoney(line.units, line.unitCost)));
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.transferReceived,
      entityType: "RetailStockTransfer",
      entityId: transfer.id,
      payload: {
        transferNo: transfer.transferNo,
        to: transfer.toSite.name,
        received: received.toNumber(),
        lost: lost.toNumber(),
        stillComing: stillComing.toNumber(),
        ...(lost.greaterThan(0) ? { lostValue: auditAmount(lostValue) } : {}),
      },
    });
    return { transfer, complete, received, lost, stillComing, short, lostLines, lostValue };
  });

  const { transfer } = done;
  if (done.lostValue.greaterThan(0)) {
    // The units left From's shelf when they were sent and stayed on the Stock
    // account on the way; what never arrives leaves it for Breakage and losses.
    const value = toNumberOrZero(done.lostValue);
    await createJournalEntryFromSource({
      companyId,
      sourceType: "RETAIL_STOCK_ADJUSTMENT",
      sourceId: `${transfer.id}:lost:${Date.now()}`,
      sourceSubtype: "LOSS",
      siteId: transfer.fromSiteId,
      entryDate: new Date(),
      description: `Lost on the way, ${transfer.transferNo}`,
      createdById: actor.userId,
      actorRole: actor.userRole ?? null,
      amount: value,
      netAmount: value,
      taxAmount: 0,
      grossAmount: value,
      invertDirection: true,
      inventory: {
        lines: done.lostLines.map((line) => ({
          inventoryItemId: line.itemId,
          itemName: line.name,
          quantity: line.units.toNumber(),
          unitCost: line.unitCost.toNumber(),
          totalCost: toNumberOrZero(multiplyMoney(line.units, line.unitCost)),
        })),
        totalCost: value,
      },
    });
  }

  const choice: ShortChoice = input.short;
  return {
    id: transfer.id,
    transferNo: transfer.transferNo,
    status: done.complete ? "RECEIVED" : "ON_THE_WAY",
    to: { id: transfer.toSiteId, name: transfer.toSite.name },
    received: done.received.toNumber(),
    lost: done.lost.toNumber(),
    stillComing: done.stillComing.toNumber(),
    lostValue: toNumberOrZero(done.lostValue),
    message: receivedToast(transfer.transferNo, transfer.toSite.name, done.short, choice),
  };
}

/* ── Cancel one (POST /api/v2/retail/stock/transfers/[id]/cancel) ──────────── */

/**
 * The record's "Cancel the transfer" (ask `canceltransfer`): what is still on
 * the way goes back on From. 409 "TRF-0007 has been received." for one that
 * is not on the way.
 */
export async function cancelTransfer(actor: RetailAuditActor, id: string): Promise<{ transferNo: string }> {
  const found = await prisma.retailStockTransfer.findFirst({
    where: { id, companyId: actor.companyId },
    select: { transferNo: true, status: true },
  });
  if (!found) throw new TransferRefusal(404, "That transfer is not this shop’s.");
  const answer = await cancelTransfers(actor, [id]);
  if (answer.cancelled.length === 0) {
    const now = await prisma.retailStockTransfer.findUniqueOrThrow({ where: { id }, select: { status: true } });
    throw new TransferRefusal(
      409,
      now.status === "CANCELLED" ? `${found.transferNo} was cancelled already.` : `${found.transferNo} has been received.`,
    );
  }
  return { transferNo: found.transferNo };
}
