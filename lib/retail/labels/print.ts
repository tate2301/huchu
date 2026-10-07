import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import type { PosDevice } from "@/lib/retail/devices";
import { formatMoney } from "@/lib/workspace/format";

import { labelData, type Label, type LabelShow, type LabelSize } from "./data";
import { A4_ON_TILL_MESSAGE, COPIES_MESSAGE, MAX_LABELS, printerName, SHOW_MESSAGE, TOO_MANY_MESSAGE } from "./words";

/**
 * Print shelf labels (PRD-06, W-20): to a till's printer as a job the till
 * pulls, or here as a PDF the person who printed it opens for 15 minutes.
 * PRD-07's Change many prices queues its labels through `printLabels` too.
 */

export const MAX_LABEL_PRODUCTS = 500;
/** How long a "Print here" PDF can be opened. */
export const HERE_PDF_MINUTES = 15;


/** Where labels go: a till's register id, or this computer. */
export type LabelPrinter = string | "here";

export type LabelsInput = {
  productIds: string[];
  size: LabelSize;
  show: LabelShow;
  copies: number;
  printer: LabelPrinter;
  /**
   * Change many prices (PRD-07): each product's own copies, at the price it
   * will have, in place of `copies` and today's price. A drop prints today's
   * price as the was.
   */
  lines?: Array<{ productId: string; copies: number; price: number }>;
  /** The Change many prices batch these labels are for, kept on the job so Undo can stop it. */
  batchId?: string;
};

export const labelsInputSchema = z
  .object({
    productIds: z
      .array(z.string().uuid("Tick the products again."), { message: "Tick at least one product." })
      .min(1, "Tick at least one product.")
      .max(MAX_LABEL_PRODUCTS, `Print at most ${MAX_LABEL_PRODUCTS} products at a time.`),
    size: z.enum(["STRIP", "TAG", "A4"], { message: "Pick a label size." }),
    show: z
      .object({ price: z.boolean(), was: z.boolean(), barcode: z.boolean() }, { message: "Say what the labels show." })
      .refine((show) => show.price || show.barcode, SHOW_MESSAGE),
    copies: z.number({ message: COPIES_MESSAGE }).int(COPIES_MESSAGE).min(1, COPIES_MESSAGE).max(50, COPIES_MESSAGE),
    printer: z.union([z.literal("here"), z.string().uuid()], { message: "Pick a printer." }),
  })
  .refine((input) => input.productIds.length * input.copies <= MAX_LABELS, { message: TOO_MANY_MESSAGE, path: ["copies"] });

/** A print refused: the sentence, its status, and the field it is about. */
export class LabelRefusal extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message);
    this.name = "LabelRefusal";
  }
}

export type PrintedLabels = {
  jobId: string;
  /** Labels times copies. */
  count: number;
  /** "Front till printer", or "here". */
  printer: string;
  /** Names of the products that printed with no price: none on the default list. Empty with Price off. */
  unpriced: string[];
  /** Products asked for that are not the company's, left out. */
  notFound: number;
};

/** The till printer labels go to: the company's live till with a printer and a paired device. */
async function tillPrinter(companyId: string, registerId: string): Promise<{ id: string; name: string }> {
  const register = await prisma.retailRegister.findFirst({
    where: { id: registerId, companyId, isActive: true, hasPrinter: true },
    select: { id: true, name: true, devices: { where: { unpairedAt: null }, take: 1, select: { id: true } } },
  });
  if (!register) throw new LabelRefusal("Pick one of the shop’s printers.", 400, { printer: "Pick one of the shop’s printers." });
  const name = printerName(register.name);
  if (register.devices.length === 0) {
    const sentence = `The ${name.charAt(0).toLowerCase()}${name.slice(1)} is not paired. Pair it, or print here.`;
    throw new LabelRefusal(sentence, 409, { printer: sentence });
  }
  return { id: register.id, name };
}

/**
 * Prints the labels: a QUEUED job for a till's printer, or a job printed here
 * whose PDF `GET /api/v2/retail/labels/<jobId>.pdf` renders. One
 * `RETAIL_LABELS.PRINTED` line per product.
 */
export async function printLabels(actor: RetailAuditActor, input: LabelsInput, now: Date = new Date()): Promise<PrintedLabels> {
  if (input.size === "A4" && input.printer !== "here") {
    throw new LabelRefusal(A4_ON_TILL_MESSAGE, 400, { size: A4_ON_TILL_MESSAGE });
  }
  const till = input.printer === "here" ? null : await tillPrinter(actor.companyId, input.printer);
  const read = await labelData(actor.companyId, { productIds: input.productIds, show: input.show, copies: input.copies, at: now });
  const labels = input.lines ? asChanged(read.labels, input.lines, input.show) : read.labels;
  if (labels.length === 0) throw new LabelRefusal("Product not found", 404);
  const printer = till?.name ?? "here";

  const job = await prisma.$transaction(async (tx) => {
    const created = await tx.retailPrintJob.create({
      data: {
        companyId: actor.companyId,
        registerId: till?.id ?? null,
        kind: "LABELS",
        payload: { size: input.size, show: input.show, labels, ...(input.batchId ? { batchId: input.batchId } : {}) },
        status: till ? "QUEUED" : "PRINTED",
        printedAt: till ? null : now,
        createdById: actor.userId,
        createdAt: now,
      },
      select: { id: true },
    });
    for (const label of labels) {
      await writeRetailAuditEvent(tx, {
        actor,
        eventType: RETAIL_AUDIT_EVENTS.labelsPrinted,
        entityType: "Product",
        entityId: label.productId,
        payload: { size: input.size, copies: label.copies, printer, jobId: created.id },
      });
    }
    return created;
  });
  const unpriced = input.show.price ? labels.filter((label) => label.price === null).map((label) => label.name) : [];
  const count = labels.reduce((total, label) => total + label.copies, 0);
  return { jobId: job.id, count, printer, unpriced, notFound: new Set(input.productIds).size - labels.length };
}

/** The labels at the prices they are changing to, each with its own copies; a line of none prints nothing. */
function asChanged(labels: Label[], lines: NonNullable<LabelsInput["lines"]>, show: LabelShow): Label[] {
  const byId = new Map(lines.map((line) => [line.productId, line]));
  return labels.flatMap((label) => {
    const line = byId.get(label.productId);
    if (!line || line.copies <= 0) return [];
    const today = label.price === null ? null : Number(label.price.replace(/[^\d.]/g, ""));
    return [
      {
        ...label,
        copies: line.copies,
        price: show.price ? formatMoney(line.price) : null,
        was: show.was && today !== null && line.price < today ? label.price : null,
      },
    ];
  });
}

/**
 * A "Print here" job's labels, for the person who printed it, while it is
 * fresh; null otherwise, so another company's or another person's id, or an
 * old one, reads as not found.
 */
export async function hereLabels(
  companyId: string,
  userId: string,
  jobId: string,
  now: Date = new Date(),
): Promise<{ size: LabelSize; labels: Label[] } | null> {
  const job = await prisma.retailPrintJob.findFirst({
    where: {
      id: jobId,
      companyId,
      createdById: userId,
      registerId: null,
      kind: "LABELS",
      createdAt: { gte: new Date(now.getTime() - HERE_PDF_MINUTES * 60_000) },
    },
    select: { payload: true },
  });
  if (!job) return null;
  const payload = job.payload as { size: LabelSize; labels: Label[] };
  return { size: payload.size, labels: payload.labels };
}

/** A till job nobody picked up in a day (an unpaired till never will) is failed, not left waiting. */
export const STALE_JOB_HOURS = 24;

/** Fails the QUEUED jobs older than a day; the count. */
export async function failStalePrintJobs(now: Date = new Date()): Promise<number> {
  const stale = await prisma.retailPrintJob.updateMany({
    where: { status: "QUEUED", createdAt: { lt: new Date(now.getTime() - STALE_JOB_HOURS * 3_600_000) } },
    data: { status: "FAILED", error: "The till did not print it within a day." },
  });
  return stale.count;
}

/** What a till pulls: its own register's waiting jobs, oldest first, ten at a time. */
export async function tillPrintJobs(device: PosDevice) {
  return prisma.retailPrintJob.findMany({
    where: { companyId: device.companyId, registerId: device.registerId, status: "QUEUED" },
    orderBy: { createdAt: "asc" },
    take: 10,
    select: { id: true, kind: true, payload: true },
  });
}

/** The till says how a job went; false when the job is not its own register's, or is already finished. */
export async function finishPrintJob(
  device: PosDevice,
  jobId: string,
  outcome: { ok: boolean; error?: string | null },
  now: Date = new Date(),
): Promise<boolean> {
  const done = await prisma.retailPrintJob.updateMany({
    where: { id: jobId, companyId: device.companyId, registerId: device.registerId, status: "QUEUED" },
    data: outcome.ok
      ? { status: "PRINTED", printedAt: now, error: null }
      : { status: "FAILED", printedAt: null, error: outcome.error?.trim() || "The printer did not print it." },
  });
  return done.count > 0;
}
