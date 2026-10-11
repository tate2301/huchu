import type { Prisma, RetailStockCountWhy } from "@prisma/client";
import { z } from "zod";

import { postRetailJournal } from "@/app/api/v2/retail/_helpers";
import { recordStockMovement } from "@/lib/inventory/stock-movements";
import { multiplyMoney, sumMoney } from "@/lib/money";
import { emitRetailNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getApprovalLimits } from "@/lib/retail/approvals/limits";
import { approvalLink, notifyApprover } from "@/lib/retail/approvals/notify";
import { auditAmount, auditRecordEdited, RETAIL_AUDIT_EVENTS, writeRetailAuditEvent } from "@/lib/retail/audit";
import { formatMoney } from "@/lib/workspace/format";

import {
  COUNT_WHY_WORDS,
  countPhrase,
  NOT_WAITING,
  ownerNeededWords,
  recountText,
  soldSinceWords,
  whyOf,
  type CountScope,
} from "./count-words";
import { CountRefusal, NOT_FOUND, needsOwner, type CountActor } from "./counts";

/**
 * Reviewing a count (30-stock W-22 steps 3–4, STK-06): an approver corrects
 * a figure, says why a line differs, sends lines back to be counted again,
 * then approves: each differing line moves on hand by its difference and the
 * net posts once to Breakage and losses. Or the count is cancelled and
 * nothing on hand changes. Renaming the shelf is the record's rail.
 */

const COUNT_LINK_TEMPLATE = "count-link";

const countPath = (id: string) => `/retail/stock/counts/${id}`;

/** The count, this shop's, or 404. */
async function countOf(companyId: string, id: string) {
  const count = await prisma.retailStockCount.findFirst({
    where: { id, companyId },
    select: {
      id: true,
      countNo: true,
      name: true,
      scope: true,
      status: true,
      siteId: true,
      counter: { select: { id: true, name: true, phone: true } },
    },
  });
  if (!count) throw new CountRefusal(404, NOT_FOUND);
  return count;
}

/* ── Rename (PATCH /api/v2/retail/stock/counts/[id]) ──────────────────────── */

export const countPatch = z
  .object({
    name: z
      .string({ message: "Name the shelf." })
      .trim()
      .min(1, "Name the shelf.")
      .max(80, "Keep it to 80 characters."),
  })
  .strict();

/** The rail's Shelf: one `RETAIL_RECORD.EDITED`. Approved and cancelled counts do not change. */
export async function renameCount(actor: CountActor, id: string, name: string): Promise<{ changed: boolean }> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "RetailStockCount" WHERE "id" = ${id} AND "companyId" = ${actor.companyId} FOR UPDATE`;
    const count = await tx.retailStockCount.findFirst({ where: { id, companyId: actor.companyId }, select: { name: true, status: true } });
    if (!count) throw new CountRefusal(404, NOT_FOUND);
    if (count.status === "APPROVED" || count.status === "CANCELLED") throw new CountRefusal(409, "Approved counts do not change.");
    if (count.name === name) return { changed: false };
    await tx.retailStockCount.update({ where: { id }, data: { name } });
    await auditRecordEdited(tx, {
      actor,
      entityType: "RetailStockCount",
      entityId: id,
      field: "name",
      label: "Shelf",
      from: count.name,
      to: name,
    });
    return { changed: true };
  });
}

/* ── Why (PATCH …/lines/[lineId]) ─────────────────────────────────────────── */

export const countWhyInput = z.object({
  why: z.enum(["BROKEN", "NOT_KNOWN", "FOUND"], { message: "Pick broken, not known or found." }),
});

/** Why a line differs, while the count waits for approval: it becomes the movement's notes. */
export async function setLineWhy(actor: CountActor, countId: string, lineId: string, why: RetailStockCountWhy): Promise<{ why: RetailStockCountWhy }> {
  const count = await countOf(actor.companyId, countId);
  if (count.status !== "TO_APPROVE") throw new CountRefusal(409, NOT_WAITING);
  const updated = await prisma.retailStockCountLine.updateMany({ where: { id: lineId, countId }, data: { why } });
  if (updated.count === 0) throw new CountRefusal(404, "That line is not on this count.");
  return { why };
}

/* ── Tell the counter ─────────────────────────────────────────────────────── */

type Counter = { id: string; name: string; phone: string | null };

async function tellCounter(
  actor: CountActor,
  counter: Counter,
  message: { title: string; summary: string; viewPath: string; entityId: string; whatsapp: ((link: string) => string) | null },
  requestUrl: string | null,
): Promise<void> {
  if (counter.id === actor.userId) return;
  await emitRetailNotification({
    companyId: actor.companyId,
    recipientIds: [counter.id],
    type: "RETAIL_COUNT_ASSIGNED",
    title: message.title,
    summary: message.summary,
    entityType: "RETAIL_STOCK_COUNT",
    entityId: message.entityId,
    viewPath: message.viewPath,
  });
  if (!counter.phone || !message.whatsapp) return;
  const link = await approvalLink(actor.companyId, message.viewPath, requestUrl);
  await prisma.retailMessage.create({
    data: {
      companyId: actor.companyId,
      channel: "WHATSAPP",
      to: counter.phone,
      template: COUNT_LINK_TEMPLATE,
      body: message.whatsapp(link),
      createdById: actor.userId,
    },
  });
}

/* ── Recount (POST …/recount) ─────────────────────────────────────────────── */

export const recountInput = z.object({ lineIds: z.array(z.string().uuid()).max(5000).optional() }).strict();

/**
 * "Recount the 3" (W-22 step 3): the ticked lines, or every differing line
 * when none is ticked, lose their figures and go back to the counter; the
 * count is counting again. The phone then shows only those lines.
 */
export async function recountLines(
  actor: CountActor,
  id: string,
  lineIds: string[] | undefined,
  requestUrl: string | null = null,
): Promise<{ lines: number; counter: string }> {
  const count = await countOf(actor.companyId, id);
  const sent = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "RetailStockCount" WHERE "id" = ${id} FOR UPDATE`;
    const { status } = await tx.retailStockCount.findUniqueOrThrow({ where: { id }, select: { status: true } });
    if (status !== "TO_APPROVE") throw new CountRefusal(409, NOT_WAITING);
    const where: Prisma.RetailStockCountLineWhereInput = lineIds?.length
      ? { countId: id, id: { in: lineIds } }
      : { countId: id, difference: { not: 0 } };
    const lines = await tx.retailStockCountLine.findMany({ where, select: { id: true } });
    if (lines.length === 0) throw new CountRefusal(400, lineIds?.length ? "Those lines are not on this count." : "No line differs.");
    if (lineIds?.length && lines.length !== new Set(lineIds).size) throw new CountRefusal(400, "Those lines are not on this count.");
    await tx.retailStockCountLine.updateMany({
      where: { id: { in: lines.map((line) => line.id) } },
      data: { counted: null, countedAt: null, countedById: null, expectedAtCount: null, difference: null, why: null, recount: true },
    });
    await tx.retailStockCount.update({ where: { id }, data: { status: "COUNTING", submittedAt: null } });
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.countRecountAsked,
      entityType: "RetailStockCount",
      entityId: id,
      payload: { countNo: count.countNo, lines: lines.length },
    });
    return lines.length;
  });

  await tellCounter(
    actor,
    count.counter,
    {
      title: `${count.countNo} to count again`,
      summary: `${actor.userName ?? "Someone"} asked you to count ${sent === 1 ? "1 line" : `${sent} lines`} of ${countPhrase(count.name, count.scope as CountScope)} again.`,
      viewPath: `${countPath(id)}/count`,
      entityId: id,
      whatsapp: (link) => recountText(sent, link),
    },
    requestUrl,
  );
  return { lines: sent, counter: count.counter.name };
}

/* ── Cancel (POST …/cancel) ───────────────────────────────────────────────── */

/** "Cancel the count": nothing on hand changes; what was counted stays for the record. */
export async function cancelCount(actor: CountActor, id: string, requestUrl: string | null = null): Promise<{ status: "CANCELLED"; countNo: string }> {
  const count = await countOf(actor.companyId, id);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "RetailStockCount" WHERE "id" = ${id} FOR UPDATE`;
    const { status } = await tx.retailStockCount.findUniqueOrThrow({ where: { id }, select: { status: true } });
    if (status === "CANCELLED") throw new CountRefusal(409, "This count is already cancelled.");
    if (status === "APPROVED") throw new CountRefusal(409, "Approved counts cannot be cancelled.");
    await tx.retailStockCount.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: actor.userId } });
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.countCancelled,
      entityType: "RetailStockCount",
      entityId: id,
      payload: { countNo: count.countNo },
    });
  });
  await tellCounter(
    actor,
    count.counter,
    {
      title: `${count.countNo} is off`,
      summary: `${actor.userName ?? "Someone"} cancelled the count of ${countPhrase(count.name, count.scope as CountScope)}. Nothing on hand changes.`,
      viewPath: countPath(id),
      entityId: id,
      whatsapp: null,
    },
    requestUrl,
  );
  return { status: "CANCELLED", countNo: count.countNo };
}

/* ── Approve (POST …/approve) ─────────────────────────────────────────────── */

/** 403: over the owner's limit for someone who is not the owner. The owner has been asked. */
export class OwnerNeeded extends CountRefusal {
  constructor(message: string) {
    super(403, message);
    this.name = "OwnerNeeded";
  }
}

export type ApprovedCount = {
  countNo: string;
  differenceValue: number;
  accountingStatus: string | null;
};

type Planned = { countNo: string; net: Prisma.Decimal; siteId: string };

/**
 * Approves a count's differences (W-22 step 4), once:
 *  1. the count row is locked, so a second approval waits and then finds it
 *     approved (409);
 *  2. the net at cost (each line to the cent) is weighed against the owner's
 *     limit: over it, someone who is not the owner is refused (403) and the
 *     owner is asked, and nothing changes;
 *  3. each differing line moves on hand by its difference (a COUNT
 *     adjustment), so what sold since it was counted stays sold; a line that
 *     sold more than the count found refuses the whole approval (409);
 *  4. the count is approved with its short, over and net;
 *  5. after the commit the net posts once to Breakage and losses, keyed by
 *     the count: Dr 5410 / Cr 1200 for a loss, the reverse for a gain.
 */
export async function approveCount(actor: CountActor, id: string, requestUrl: string | null = null): Promise<ApprovedCount> {
  const head = await countOf(actor.companyId, id);
  const limits = await getApprovalLimits(actor.companyId);
  const isOwner = actor.userRole === "SUPERADMIN";

  let refusedOver: Planned | null = null;
  const done = await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "RetailStockCount" WHERE "id" = ${id} FOR UPDATE`;
      const count = await tx.retailStockCount.findUniqueOrThrow({
        where: { id },
        select: {
          status: true,
          countNo: true,
          siteId: true,
          lines: {
            orderBy: [{ sortKey: "asc" }, { id: "asc" }],
            select: {
              id: true,
              inventoryItemId: true,
              difference: true,
              unitCost: true,
              why: true,
              inventoryItem: { select: { name: true, unit: true, product: { select: { name: true } } } },
            },
          },
        },
      });
      if (count.status !== "TO_APPROVE") throw new CountRefusal(409, NOT_WAITING);

      const differing = count.lines.filter((line) => line.difference && !line.difference.isZero());
      const valued = differing.map((line) => ({ line, value: multiplyMoney(line.difference!, line.unitCost) }));
      const short = sumMoney(valued.filter((entry) => entry.value.isNegative()).map((entry) => entry.value));
      const over = sumMoney(valued.filter((entry) => !entry.value.isNegative()).map((entry) => entry.value));
      const net = short.plus(over);
      if (!isOwner && needsOwner(limits, net.toNumber())) {
        refusedOver = { countNo: count.countNo, net, siteId: count.siteId };
        return null;
      }

      for (const { line } of valued) {
        const product = line.inventoryItem.product?.name ?? line.inventoryItem.name;
        try {
          await recordStockMovement({
            tx,
            companyId: actor.companyId,
            userId: actor.userId,
            itemId: line.inventoryItemId,
            movementType: "ADJUSTMENT",
            quantity: line.difference!,
            unit: line.inventoryItem.unit,
            unitCost: line.unitCost,
            notes: COUNT_WHY_WORDS[whyOf(line.why, line.difference!.toNumber())],
            approvedBy: actor.userName,
            reason: "COUNT",
            reference: count.countNo,
            sourceType: "RETAIL_STOCK_ADJUSTMENT",
            sourceId: `${id}:${line.id}`,
          });
        } catch (error) {
          if (error instanceof Error && error.message === "Stock cannot be negative.") {
            throw new CountRefusal(409, soldSinceWords(product));
          }
          throw error;
        }
      }

      await tx.retailStockCount.update({
        where: { id },
        data: {
          status: "APPROVED",
          approvedAt: new Date(),
          approvedById: actor.userId,
          differenceValue: net,
          shortValue: short,
          overValue: over,
        },
      });
      await writeRetailAuditEvent(tx, {
        actor,
        eventType: RETAIL_AUDIT_EVENTS.countApproved,
        entityType: "RetailStockCount",
        entityId: id,
        payload: {
          countNo: count.countNo,
          lines: count.lines.length,
          differ: differing.length,
          net: auditAmount(net),
          short: auditAmount(short),
          over: auditAmount(over),
        },
      });
      return { countNo: count.countNo, siteId: count.siteId, net, valued };
    },
    { timeout: 30_000 },
  );

  if (!done) {
    const over = refusedOver as Planned | null;
    const limit = formatMoney(limits.countOwnerOver.toNumber());
    if (over) {
      await notifyApprover({
        companyId: actor.companyId,
        level: "owner",
        siteId: over.siteId,
        type: "RETAIL_COUNT_SUBMITTED",
        title: `${over.countNo} needs the owner`,
        summary: `${head.name}: ${formatMoney(over.net.toNumber())} at cost, over the ${limit} a manager may approve.`,
        entityType: "RETAIL_STOCK_COUNT",
        entityId: id,
        viewPath: `${countPath(id)}/review`,
        severity: "WARNING",
        askedById: actor.userId,
        requestUrl,
      });
    }
    throw new OwnerNeeded(ownerNeededWords(limit, limits.ownerApprover?.name ?? null));
  }

  let accountingStatus: string | null = null;
  if (!done.net.isZero()) {
    const amount = done.net.abs().toNumber();
    const loss = done.net.isNegative();
    try {
      const posted = await postRetailJournal({
        companyId: actor.companyId,
        sourceType: "RETAIL_STOCK_ADJUSTMENT",
        sourceId: id,
        sourceSubtype: loss ? "LOSS" : "GAIN",
        siteId: done.siteId,
        entryDate: new Date(),
        description: `Stock count ${done.countNo}`,
        createdById: actor.userId,
        actorRole: actor.userRole ?? null,
        amount,
        netAmount: amount,
        grossAmount: amount,
        taxAmount: 0,
        invertDirection: loss,
        inventory: {
          lines: done.valued.map(({ line, value }) => ({
            inventoryItemId: line.inventoryItemId,
            itemName: line.inventoryItem.product?.name ?? line.inventoryItem.name,
            quantity: line.difference!.abs().toNumber(),
            unitCost: line.unitCost.toNumber(),
            totalCost: value.abs().toNumber(),
          })),
          totalCost: amount,
        },
      });
      accountingStatus = posted.accountingStatus;
    } catch (error) {
      // The count is approved and its stock moved; a posting that fails waits for the posting run.
      console.error(`[stock count] ${done.countNo} approved, its journal did not post:`, error);
      accountingStatus = "FAILED";
    }
  }
  return { countNo: done.countNo, differenceValue: done.net.toNumber(), accountingStatus };
}

/* ── Approve many (POST /api/v2/retail/stock/counts/approve) ──────────────── */

export const countIdsInput = z.object({
  ids: z.array(z.string().uuid(), { message: "Tick a count first." }).min(1, "Tick a count first.").max(100, "Approve at most 100 at a time."),
});

/**
 * Counts › tick rows › "Approve the differences": each through
 * `approveCount`. Over the owner's limit waits for the owner; not waiting
 * for approval (or refused for a line that sold since) is skipped.
 */
export async function approveCounts(
  actor: CountActor,
  ids: string[],
  requestUrl: string | null = null,
): Promise<{ approved: string[]; waiting: string[]; skipped: string[] }> {
  const counts = await prisma.retailStockCount.findMany({
    where: { companyId: actor.companyId, id: { in: [...new Set(ids)] } },
    orderBy: { countNo: "asc" },
    select: { id: true, countNo: true },
  });
  const answer = { approved: [] as string[], waiting: [] as string[], skipped: [] as string[] };
  for (const count of counts) {
    try {
      await approveCount(actor, count.id, requestUrl);
      answer.approved.push(count.countNo);
    } catch (error) {
      if (error instanceof OwnerNeeded) answer.waiting.push(count.countNo);
      else if (error instanceof CountRefusal) answer.skipped.push(count.countNo);
      else throw error;
    }
  }
  return answer;
}

