import { randomUUID } from "node:crypto";

import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { startOfDayIn } from "@/lib/reports/list-query";
import { getApprovalLimits } from "@/lib/retail/approvals/limits";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import { shopSiteId } from "@/lib/retail/devices";
import { LabelRefusal, printLabels } from "@/lib/retail/labels/print";
import { harareMoment } from "@/lib/retail/pricing/engine";
import { SHOP_TIME_ZONE } from "@/lib/retail/shop-profile-rules";
import { dailySlot } from "@/lib/retail/worker/schedule";

import { applyDuePriceChanges, changePrices, PriceRefusal } from "./change";
import { centsOf } from "./figure";
import { changedSentence, NOT_ON_LIST, notSavedSentence, undoneSentence } from "./words";

/**
 * Change many prices (W-15, PRD-07): one BULK batch on one list, now, tonight
 * after closing, or from a day; the owner rule asked as it is scheduled; new
 * shelf labels at the prices as they will be. A batch waiting to come due can
 * be undone (`cancelBatch`). Due rows are applied by the retail worker every
 * minute and by the next read of the till's prices or the worksheet,
 * whichever is first, each exactly once (`applyDuePriceChanges` claims rows).
 */

/** The shop keeps no closing time (SET-01 left hours to Sites): "after closing" is 22:00 on the shop's clock. */
export const CLOSING_TIME = "22:00";

/** Today's closing on the shop's clock, or tomorrow's once today's has passed. */
export function tonightAt(now: Date = new Date()): { at: Date; tomorrow: boolean } {
  const today = dailySlot(now, CLOSING_TIME, SHOP_TIME_ZONE);
  return today > now ? { at: today, tomorrow: false } : { at: new Date(today.getTime() + 86_400_000), tomorrow: true };
}

export const DATE_MESSAGE = "Pick a date from tomorrow.";

/** A day's start on the shop's clock, when it is after `now`; else null. */
export function dateAt(day: string, now: Date = new Date()): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day <= harareMoment(now).day) return null;
  const at = startOfDayIn(day, SHOP_TIME_ZONE);
  return at > now ? at : null;
}

export const changeManyInput = z.object({
  listId: z.string().uuid(),
  lines: z
    .array(
      z.object({
        productId: z.string().uuid(),
        price: z.string().max(24),
        labels: z.number().int().min(0).max(50),
      }),
    )
    .min(1, "Add the products to change.")
    .max(500, "Change at most 500 prices at a time."),
  when: z.enum(["NOW", "TONIGHT", "DATE"]),
  date: z.string().nullish(),
  printLabels: z.boolean(),
});

export type ChangeManyInput = z.infer<typeof changeManyInput>;

/** Refused before anything is saved: the sentence, its status and the fields (`lines.2`) it is about. */
export class ChangeManyRefusal extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}

export type ChangeManyResult = {
  data: { batchId: string; effectiveAt: string; applied: boolean; labelsJobId: string | null; pdfUrl: string | null };
  message: string;
};

/** The first paired till printer at the list's site, else at the shop's own site; null when there is none. */
async function tillPrinterFor(companyId: string, siteId: string | null): Promise<string | null> {
  const site = siteId ?? (await shopSiteId(companyId));
  if (!site) return null;
  const register = await prisma.retailRegister.findFirst({
    where: { companyId, siteId: site, isActive: true, hasPrinter: true, devices: { some: { unpairedAt: null } } },
    orderBy: { code: "asc" },
    select: { id: true },
  });
  return register?.id ?? null;
}

export async function changeMany(actor: RetailAuditActor, input: ChangeManyInput, now: Date = new Date()): Promise<ChangeManyResult> {
  const { companyId } = actor;
  const list = await prisma.priceList.findFirst({
    where: { id: input.listId, companyId, archivedAt: null },
    select: { id: true, name: true, siteId: true, minQuantity: true },
  });
  if (!list) throw new ChangeManyRefusal(404, "Price list not found");

  const when =
    input.when === "NOW"
      ? ({ kind: "NOW" } as const)
      : input.when === "TONIGHT"
        ? ({ kind: "TONIGHT", ...tonightAt(now) } as const)
        : (() => {
            const at = dateAt(input.date ?? "", now);
            if (!at) throw new ChangeManyRefusal(400, DATE_MESSAGE, { date: DATE_MESSAGE });
            return { kind: "DATE", at } as const;
          })();
  const effectiveAt = when.kind === "NOW" ? null : when.at;

  // One line per product: the last one typed wins.
  const lines = [...new Map(input.lines.map((line) => [line.productId, line])).values()];
  const indexOf = new Map(input.lines.map((line, index) => [line.productId, index]));
  const batchId = randomUUID();
  let applied = 0;
  try {
    await prisma.$transaction(async (tx) => {
      // Only products already on the list: putting one on it is Add products (W-16), with its history and event.
      const onList = new Set(
        (
          await tx.productPrice.findMany({
            where: { priceListId: list.id, minQuantity: list.minQuantity, productId: { in: lines.map((line) => line.productId) } },
            select: { productId: true },
          })
        ).map((row) => row.productId),
      );
      const refused: Record<string, string> = {};
      for (const line of lines) if (!onList.has(line.productId)) refused[line.productId] = NOT_ON_LIST;
      try {
        const result = await changePrices(tx, {
          companyId,
          actor,
          listId: list.id,
          rows: lines.filter((line) => onList.has(line.productId)).map((line) => ({ productId: line.productId, price: line.price, minQuantity: list.minQuantity })),
          source: "BULK",
          batchId,
          effectiveAt,
          limits: await getApprovalLimits(companyId, tx),
        });
        applied = result.applied;
      } catch (error) {
        if (!(error instanceof PriceRefusal)) throw error;
        Object.assign(refused, error.refused);
      }
      if (Object.keys(refused).length > 0) throw new PriceRefusal(refused);
      if (effectiveAt) {
        await writeRetailAuditEvent(tx, {
          actor,
          eventType: RETAIL_AUDIT_EVENTS.priceScheduled,
          entityType: "PriceList",
          entityId: list.id,
          payload: { list: list.name, count: lines.length, effectiveAt: effectiveAt.toISOString(), batchId },
        });
      }
    });
  } catch (error) {
    if (!(error instanceof PriceRefusal)) throw error;
    const fieldErrors = Object.fromEntries(
      Object.entries(error.refused).map(([productId, sentence]) => [`lines.${indexOf.get(productId) ?? 0}`, sentence]),
    );
    throw new ChangeManyRefusal(400, notSavedSentence(Object.keys(error.refused).length), fieldErrors);
  }

  // The labels, at the prices as they will be; the prices stand whatever the printer says.
  let labelsJobId: string | null = null;
  let pdfUrl: string | null = null;
  const labelled = lines.filter((line) => line.labels > 0);
  if (input.printLabels && labelled.length > 0) {
    const printer = await tillPrinterFor(companyId, list.siteId);
    try {
      const printed = await printLabels(
        actor,
        {
          productIds: labelled.map((line) => line.productId),
          size: "STRIP",
          show: { price: true, was: true, barcode: true },
          copies: 1,
          printer: printer ?? "here",
          lines: labelled.map((line) => ({ productId: line.productId, copies: line.labels, price: centsOf(line.price)! / 100 })),
          batchId,
        },
        now,
      );
      labelsJobId = printed.jobId;
      if (printed.printer === "here") pdfUrl = `/api/v2/retail/labels/${printed.jobId}.pdf`;
    } catch (error) {
      if (!(error instanceof LabelRefusal)) throw error;
    }
  }

  return {
    data: { batchId, effectiveAt: (effectiveAt ?? now).toISOString(), applied: effectiveAt === null, labelsJobId, pdfUrl },
    // Now: the prices that moved ("Those prices are already set." when none did); later: the lines scheduled.
    message: changedSentence(effectiveAt ? lines.length : applied, when, labelsJobId ? (pdfUrl ? "here" : "queued") : null),
  };
}

/**
 * Undo a batch still waiting: its rows not yet applied are cancelled, the
 * rows already applied stay, and its shelf labels still waiting for the till
 * are stopped ("Undone"), so no label prints a price that never comes. One
 * RETAIL_PRICE.SCHEDULE_CANCELLED on the list. 404 for a batch that is not the
 * shop's; 409 when every row has come due already.
 */
export async function cancelBatch(
  actor: RetailAuditActor,
  batchId: string,
  now: Date = new Date(),
): Promise<{ data: { cancelled: number }; message: string }> {
  const { companyId } = actor;
  return prisma.$transaction(async (tx) => {
    const waiting = await tx.productPriceChange.findMany({
      where: { companyId, batchId, appliedAt: null, cancelledAt: null },
      select: { id: true, effectiveAt: true, priceList: { select: { id: true, name: true } } },
    });
    if (waiting.length === 0) {
      const any = await tx.productPriceChange.count({ where: { companyId, batchId } });
      if (any === 0) throw new ChangeManyRefusal(404, "Price change not found");
      throw new ChangeManyRefusal(409, "Those prices have changed already. Change them back on the list.");
    }
    // Claimed as the worker claims: a row the worker applied a moment ago is not counted as undone.
    const cancelled = await tx.productPriceChange.updateMany({
      where: { id: { in: waiting.map((row) => row.id) }, appliedAt: null, cancelledAt: null },
      data: { cancelledAt: now },
    });
    const labels = { companyId, kind: "LABELS" as const, payload: { path: ["batchId"], equals: batchId } };
    await tx.retailPrintJob.updateMany({ where: { ...labels, status: "QUEUED" }, data: { status: "FAILED", error: "Undone" } });
    const printed = (await tx.retailPrintJob.count({ where: { ...labels, status: "PRINTED", registerId: { not: null } } })) > 0;
    const first = waiting[0]!;
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.priceScheduleCancelled,
      entityType: "PriceList",
      entityId: first.priceList.id,
      payload: { list: first.priceList.name, count: cancelled.count, effectiveAt: first.effectiveAt.toISOString(), batchId },
    });
    return { data: { cancelled: cancelled.count }, message: undoneSentence(printed) };
  });
}

/** The worker's job: every shop with a change come due, applied (each row once). */
export async function applyDuePriceChangesForAll(now: Date = new Date()): Promise<string> {
  const due = await prisma.productPriceChange.findMany({
    where: { effectiveAt: { lte: now }, appliedAt: null, cancelledAt: null },
    distinct: ["companyId"],
    select: { companyId: true },
  });
  let applied = 0;
  for (const { companyId } of due) applied += await applyDuePriceChanges(companyId, now);
  return `${applied} applied`;
}
