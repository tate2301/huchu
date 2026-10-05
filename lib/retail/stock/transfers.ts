import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { reserveIdentifier } from "@/lib/id-generator";
import { recordStockMovement } from "@/lib/inventory/stock-movements";
import { money, multiplyMoney, quantity, sumMoney, ZERO } from "@/lib/money";
import { emitRetailTransferCancelledNotification, emitRetailTransferSentNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { auditAmount, RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";

import { isCountedUnit, onlyWords } from "./transfer-words";

/**
 * Moving stock between sites (30-stock W-24 steps 1–2, 4.5): send a transfer,
 * and call off the ones still on the way.
 *
 * Sending issues every line at the site it leaves, under the transfer's number
 * (`TRANSFER_OUT`), so the stock is off that shelf at once. No journal: the
 * stock stays on the same Stock account while it is on the way, and the
 * on-the-way value is the transfer lines' value. Receiving it is STK-08's.
 */

export type TransferActor = RetailAuditActor & { userName: string | null };

/** A refusal the route answers with its status: under fields (400) or as a sentence (404, 409). */
export class TransferRefusal extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
    readonly fieldErrors: Record<string, string> | null = null,
  ) {
    super(message);
    this.name = "TransferRefusal";
  }
}

/* ── Send (POST /api/v2/retail/stock/transfers) ─────────────────────────── */

/** A quantity as typed: a number above 0, at most four places. */
const QUANTITY = /^\d+(\.\d{1,4})?$/;

export const transferInput = z.object({
  fromSiteId: z.string({ message: "Pick the site it leaves." }).uuid("Pick the site it leaves."),
  toSiteId: z.string({ message: "Pick the site it goes to." }).uuid("Pick the site it goes to."),
  lines: z
    .array(z.object({ lineId: z.string().uuid("Pick a product from the list."), quantity: z.string().trim() }), {
      message: "Add what goes.",
    })
    .min(1, "Add what goes.")
    .max(200, "Send at most 200 lines at a time."),
  takenById: z.string({ message: "Say who takes it." }).uuid("Say who takes it."),
  arrives: z
    .string({ message: "Say when it arrives." })
    .trim()
    .min(1, "Say when it arrives.")
    .max(60, "Keep when it arrives to 60 characters."),
});

export type TransferInput = z.infer<typeof transferInput>;

/** The sheet's field each input key is drawn under. */
const FIELD_OF: Record<string, string> = {
  fromSiteId: "from",
  toSiteId: "to",
  lines: "lines",
  takenById: "who",
  arrives: "when",
};

/** A body that did not parse, as the sheet's fields: `{ to, "lines.2", who, when }`. */
export function transferFieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const [head, index] = issue.path;
    const field = FIELD_OF[String(head)] ?? String(head);
    const key = field === "lines" && typeof index === "number" ? `lines.${index}` : field;
    if (!(key in errors)) errors[key] = issue.message;
  }
  return errors;
}

export type SentTransfer = {
  id: string;
  transferNo: string;
  units: number;
  /** At cost; only for someone who may see cost. */
  value?: number;
  to: { id: string; name: string };
};

/**
 * Sends stock from one open site to another. Every line must be a stock line
 * of a product at the site it leaves, sent at most what is on hand; the
 * person taking it must work here. One transaction: the transfer, its lines,
 * a `TRANSFER_OUT` issue per line and the `RETAIL_STOCK_TRANSFER.SENT` event.
 * Then everyone who may receive transfers, except the sender, is told.
 */
export async function sendTransfer(
  actor: TransferActor & { canSeeCost: boolean },
  input: TransferInput,
): Promise<SentTransfer> {
  const { companyId } = actor;

  const sent = await prisma.$transaction(async (tx) => {
    const sites = await tx.site.findMany({
      where: { companyId, id: { in: [input.fromSiteId, input.toSiteId] } },
      select: { id: true, name: true, isActive: true },
    });
    const from = sites.find((site) => site.id === input.fromSiteId);
    const to = sites.find((site) => site.id === input.toSiteId);
    const errors: Record<string, string> = {};
    if (!from || !from.isActive) errors.from = "Pick one of this shop’s open sites.";
    if (input.fromSiteId === input.toSiteId) errors.to = "Pick a different site.";
    else if (!to || !to.isActive) errors.to = "Pick one of this shop’s open sites.";

    const taker = await tx.user.findFirst({
      where: { id: input.takenById, companyId, isActive: true },
      select: { id: true, name: true },
    });
    if (!taker) errors.who = "Pick someone who works here.";

    const items = await tx.inventoryItem.findMany({
      where: { id: { in: input.lines.map((line) => line.lineId) }, site: { companyId } },
      select: { id: true, siteId: true, productId: true, unit: true, currentStock: true, unitCost: true, name: true },
    });
    const itemById = new Map(items.map((item) => [item.id, item]));
    const seen = new Set<string>();
    const lines: Array<{ item: (typeof items)[number]; productId: string; quantity: Prisma.Decimal }> = [];
    input.lines.forEach((line, index) => {
      const key = `lines.${index}`;
      const item = itemById.get(line.lineId);
      if (!item || !item.productId || item.siteId !== input.fromSiteId) {
        errors[key] = from ? `That product is not kept at ${from.name}.` : "That product is not kept there.";
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
      if (units.greaterThan(item.currentStock)) {
        errors[key] = onlyWords(item.currentStock.toNumber(), from?.name ?? "that site");
        return;
      }
      lines.push({ item, productId: item.productId, quantity: units });
    });
    if (Object.keys(errors).length > 0 || !from || !to || !taker) {
      throw new TransferRefusal(400, Object.values(errors)[0] ?? "Check the transfer.", errors);
    }

    const transferNo = await reserveIdentifier(tx, { companyId, entity: "RETAIL_STOCK_TRANSFER" });
    const transfer = await tx.retailStockTransfer.create({
      data: {
        companyId,
        transferNo,
        fromSiteId: from.id,
        toSiteId: to.id,
        sentById: actor.userId,
        driver: taker.name,
        arrives: input.arrives,
        lines: {
          create: lines.map((line) => ({
            companyId,
            productId: line.productId,
            fromItemId: line.item.id,
            quantitySent: line.quantity,
            unitCost: money(line.item.unitCost ?? 0),
          })),
        },
      },
      select: { id: true, lines: { select: { id: true, fromItemId: true } } },
    });
    const lineIdOf = new Map(transfer.lines.map((line) => [line.fromItemId, line.id]));

    for (const line of lines) {
      try {
        await recordStockMovement({
          tx,
          companyId,
          userId: actor.userId,
          itemId: line.item.id,
          movementType: "ISSUE",
          quantity: line.quantity,
          unit: line.item.unit,
          unitCost: line.item.unitCost ?? undefined,
          reason: "TRANSFER_OUT",
          reference: transferNo,
          notes: `Transfer to ${to.name}`,
          sourceType: "RETAIL_STOCK_TRANSFER",
          sourceId: `${transfer.id}:${lineIdOf.get(line.item.id)}`,
        });
      } catch (error) {
        // Someone sold or moved it between the check and the lock.
        if (error instanceof Error && error.message === "Insufficient stock.") {
          throw new TransferRefusal(409, `${line.item.name} changed while you were sending it. Check how many are left and send again.`);
        }
        throw error;
      }
    }

    const units = lines.reduce((sum, line) => sum.plus(line.quantity), ZERO);
    const value = sumMoney(lines.map((line) => multiplyMoney(line.quantity, line.item.unitCost ?? 0)));
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.transferSent,
      entityType: "RetailStockTransfer",
      entityId: transfer.id,
      payload: {
        transferNo,
        lines: lines.length,
        units: units.toNumber(),
        value: auditAmount(value),
        from: from.name,
        to: to.name,
      },
    });
    return { id: transfer.id, transferNo, units, value, from, to };
  });

  await emitRetailTransferSentNotification({
    companyId,
    transferId: sent.id,
    transferNo: sent.transferNo,
    fromName: sent.from.name,
    toName: sent.to.name,
    recipientIds: await transferReceivers(companyId, actor.userId),
  });

  return {
    id: sent.id,
    transferNo: sent.transferNo,
    units: sent.units.toNumber(),
    ...(actor.canSeeCost ? { value: sent.value.toNumber() } : {}),
    to: { id: sent.to.id, name: sent.to.name },
  };
}

/**
 * Who is told a transfer is coming: everyone who may receive one
 * (`retail.transfers:update`), except whoever sent it. People do not belong
 * to sites yet (30-stock open question 12), so every such person hears.
 */
export async function transferReceivers(companyId: string, senderId: string): Promise<string[]> {
  const people = await prisma.user.findMany({
    where: { companyId, isActive: true, id: { not: senderId } },
    select: { id: true, role: true },
  });
  return people.filter((person) => canRetailRoleDo(person.role, "retail.transfers", "update")).map((person) => person.id);
}

/* ── Cancel (POST /api/v2/retail/stock/transfers/cancel) ─────────────────── */

export const transferIdsInput = z.object({
  ids: z.array(z.string().uuid()).min(1, "Tick a transfer first.").max(200, "Tick at most 200 transfers."),
});

export type CancelledTransfers = { cancelled: string[]; skipped: string[] };

type CalledOff = { id: string; transferNo: string; fromName: string; units: number };

/**
 * Calls off transfers still on the way (W-24 step 5): every unit still to come
 * goes back on the site it left (`RECEIPT`, `TRANSFER_BACK`). A transfer with
 * nothing received is Cancelled; one partly received becomes Received with
 * the rest returned. Received and cancelled transfers are skipped. One event
 * per transfer called off, and the people who receive transfers are told.
 */
export async function cancelTransfers(actor: RetailAuditActor, ids: string[]): Promise<CancelledTransfers> {
  const { companyId } = actor;
  const calledOff: CalledOff[] = [];
  const answer = await prisma.$transaction(async (tx) => {
    const found = await tx.retailStockTransfer.findMany({
      where: { companyId, id: { in: ids } },
      select: { id: true, transferNo: true },
      orderBy: { transferNo: "asc" },
    });
    const cancelled: string[] = [];
    const skipped: string[] = [];
    for (const { id } of found) {
      // Held for the rest of the transaction, so a receipt cannot land in between.
      await tx.$queryRaw`SELECT "id" FROM "RetailStockTransfer" WHERE "id" = ${id} FOR UPDATE`;
      const transfer = await tx.retailStockTransfer.findUniqueOrThrow({
        where: { id },
        select: {
          id: true,
          transferNo: true,
          status: true,
          fromSite: { select: { name: true } },
          lines: {
            select: {
              id: true,
              fromItemId: true,
              quantitySent: true,
              quantityReceived: true,
              quantityLost: true,
              unitCost: true,
              fromItem: { select: { unit: true } },
            },
          },
        },
      });
      if (transfer.status !== "ON_THE_WAY") {
        skipped.push(transfer.transferNo);
        continue;
      }
      let returned = ZERO;
      let receivedAny = false;
      for (const line of transfer.lines) {
        const toCome = line.quantitySent.minus(line.quantityReceived).minus(line.quantityLost);
        if (line.quantityReceived.greaterThan(0)) receivedAny = true;
        if (toCome.lessThanOrEqualTo(0)) continue;
        await recordStockMovement({
          tx,
          companyId,
          userId: actor.userId,
          itemId: line.fromItemId,
          movementType: "RECEIPT",
          quantity: toCome,
          unit: line.fromItem.unit,
          reason: "TRANSFER_BACK",
          reference: transfer.transferNo,
          notes: `Back from ${transfer.transferNo}`,
          sourceType: "RETAIL_STOCK_TRANSFER",
          sourceId: `${transfer.id}:${line.id}:back`,
        });
        returned = returned.plus(toCome);
      }
      const now = new Date();
      await tx.retailStockTransfer.update({
        where: { id },
        data: receivedAny
          ? { status: "RECEIVED", receivedAt: now, cancelledAt: now, cancelledById: actor.userId }
          : { status: "CANCELLED", cancelledAt: now, cancelledById: actor.userId },
      });
      await writeRetailAuditEvent(tx, {
        actor,
        eventType: RETAIL_AUDIT_EVENTS.transferCancelled,
        entityType: "RetailStockTransfer",
        entityId: id,
        payload: { transferNo: transfer.transferNo, returned: returned.toNumber(), from: transfer.fromSite.name },
      });
      cancelled.push(transfer.transferNo);
      calledOff.push({ id, transferNo: transfer.transferNo, fromName: transfer.fromSite.name, units: returned.toNumber() });
    }
    return { cancelled, skipped };
  });

  if (calledOff.length > 0) {
    const recipientIds = await transferReceivers(companyId, actor.userId);
    for (const transfer of calledOff) {
      await emitRetailTransferCancelledNotification({
        companyId,
        transferId: transfer.id,
        transferNo: transfer.transferNo,
        fromName: transfer.fromName,
        units: transfer.units,
        recipientIds,
      });
    }
  }
  return answer;
}
