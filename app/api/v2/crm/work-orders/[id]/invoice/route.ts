import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { createInvoiceForLead } from "@/lib/crm/accounting-bridge";
import { canEditRecord, canUser, denialMessage } from "@/lib/crm/permissions";
import {
  clearInvoiceClaim,
  invoiceWorkOrderSchema,
  isBillingRefusal,
  isClaimHeld,
  readInvoiceClaim,
  invoiceNoteFor,
  invoiceNotePrefix,
  readInvoiceLink,
  workOrderInvoiceBlockers,
  workOrderInvoiceLines,
  writeInvoiceClaim,
  writeInvoiceLink,
  type WorkOrderInvoiceLink,
} from "@/lib/crm/work-orders";
import { jobRecordRefs, loadJobForAction, recordJobActivity } from "../../_shared";

/**
 * The invoice a finished job earned.
 *
 * This is the thing that was missing: a job could be raised, worked and signed
 * off, and nothing downstream ever happened. Now it does — but only when
 * somebody asks. Billing a customer is a financial act, and an invoice that
 * appears because a crew tapped Done on a phone is an invoice nobody decided
 * to send.
 *
 * The money is not written here. `createInvoiceForLead` raises the accounting
 * invoice, files the `CrmLeadDocument` link and posts the AR journal, exactly
 * as the deal and lead invoice routes do.
 */

/**
 * The invoice this job already produced, if it has.
 *
 * Three ways in, weakest last, because each survives a failure the one before
 * it does not.
 *
 * `CrmWorkOrder` has no column for the link, so it lives in the job's
 * `customFields` under a reserved key — the fastest answer and the usual one.
 * The activity trail is checked next, because if the deal is ever deleted the
 * job's `dealId` is nulled and a link written before that would be the only
 * record left.
 *
 * The invoice's own note is the last and the only one that survives the
 * dangerous failure: the link and the trail are both written AFTER
 * `createInvoiceForLead` commits, so a process that dies in between leaves a
 * real invoice that neither of them knows about. The note is written inside
 * that transaction. Without this third read, the next attempt — once the claim
 * expires — would find nothing and bill the customer a second time.
 */
async function existingInvoice(
  companyId: string,
  job: { id: string; customFields: unknown },
  workOrderNo: string,
): Promise<{ documentId: string; link: WorkOrderInvoiceLink | null } | null> {
  const link = readInvoiceLink(job.customFields);
  if (link) {
    const doc = await prisma.crmLeadDocument.findFirst({
      where: { id: link.documentId, companyId, type: "INVOICE" },
      select: { id: true },
    });
    if (doc) return { documentId: doc.id, link };
  }

  const trail = await prisma.crmActivity.findFirst({
    where: {
      companyId,
      AND: [
        { metadata: { path: ["kind"], equals: "WORK_ORDER_INVOICE" } },
        { metadata: { path: ["workOrderId"], equals: job.id } },
      ],
    },
    select: { metadata: true },
    orderBy: { occurredAt: "asc" },
  });
  const documentId = (trail?.metadata as Record<string, unknown> | null)?.documentId;
  if (typeof documentId !== "string") return orphanedInvoice(companyId, workOrderNo);

  const doc = await prisma.crmLeadDocument.findFirst({
    where: { id: documentId, companyId, type: "INVOICE" },
    select: { id: true },
  });
  return doc ? { documentId: doc.id, link: null } : null;
}

/**
 * An invoice this job raised that never got its link written.
 *
 * Only reachable if a previous attempt committed the money and then died, so
 * it is the last thing tried rather than the first — but it has to be tried,
 * because the alternative is billing somebody twice for one visit.
 */
async function orphanedInvoice(
  companyId: string,
  workOrderNo: string,
): Promise<{ documentId: string; link: WorkOrderInvoiceLink | null } | null> {
  const doc = await prisma.crmLeadDocument.findFirst({
    where: {
      companyId,
      type: "INVOICE",
      invoice: { notes: { startsWith: invoiceNotePrefix(workOrderNo) } },
    },
    select: { id: true },
  });
  return doc ? { documentId: doc.id, link: null } : null;
}

/** The job's `customFields` as they are now, which is what a claim turns on. */
async function reloadForClaim(
  companyId: string,
  id: string,
): Promise<{ id: string; customFields: unknown }> {
  const fresh = await prisma.crmWorkOrder.findFirst({
    where: { id, companyId },
    select: { customFields: true },
  });
  return { id, customFields: fresh?.customFields ?? null };
}

/** Take the claim off a job nothing was billed against after all. */
async function releaseClaim(companyId: string, id: string): Promise<void> {
  try {
    const fresh = await reloadForClaim(companyId, id);
    await prisma.crmWorkOrder.update({
      where: { id },
      data: { customFields: clearInvoiceClaim(fresh.customFields) as Prisma.InputJsonObject },
    });
  } catch (error) {
    // The claim expires on its own, so failing to lift it early is a delay
    // rather than a dead end — and it must not replace the error that got here.
    console.error("[API] Could not release the invoice claim on work order", id, error);
  }
}

async function describeDocument(companyId: string, documentId: string) {
  const doc = await prisma.crmLeadDocument.findFirst({
    where: { id: documentId, companyId },
    select: {
      id: true,
      amount: true,
      currency: true,
      invoiceId: true,
      invoice: { select: { invoiceNumber: true, total: true, status: true, invoiceDate: true } },
    },
  });
  if (!doc) return null;
  return {
    documentId: doc.id,
    invoiceId: doc.invoiceId,
    invoiceNumber: doc.invoice?.invoiceNumber ?? null,
    status: doc.invoice?.status ?? null,
    total: doc.invoice?.total ?? doc.amount,
    currency: doc.currency,
    issuedAt: doc.invoice?.invoiceDate?.toISOString() ?? null,
  };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { id } = await params;

    const job = await loadJobForAction(companyId, id);
    if (!job) return errorResponse("Job not found", 404);

    // Being on the crew is enough to work the job; it is not enough to bill for
    // it. Both tests, in the order the deal invoice route makes them.
    if (!(await canEditRecord(session, job.assignedToId))) {
      return errorResponse("You can only invoice jobs assigned to you", 403);
    }
    if (!(await canUser(session, "documents.issue"))) {
      return errorResponse(denialMessage("documents.issue"), 403);
    }

    const body = await request.json().catch(() => ({}));
    const data = invoiceWorkOrderSchema.parse(body ?? {});

    // Asked twice, billed once. The second press gets the first invoice back.
    const already = await existingInvoice(companyId, job, job.workOrderNo);
    if (already) {
      const described = await describeDocument(companyId, already.documentId);
      return successResponse({ ...described, alreadyInvoiced: true }, 200);
    }

    const blockers = workOrderInvoiceBlockers(job);
    if (blockers.length > 0) {
      return NextResponse.json(
        { error: "This job can't be invoiced yet", code: "NOT_INVOICEABLE", blockers },
        { status: 409 },
      );
    }

    // The checklist carries quantities, never prices — so the prices come back
    // off the quote the checklist was lifted from.
    const source = job.documentId
      ? await prisma.crmLeadDocument.findFirst({
          where: { id: job.documentId, companyId },
          select: {
            currency: true,
            quotation: {
              select: { lines: { select: { description: true, unitPrice: true, taxRate: true } } },
            },
          },
        })
      : null;

    const derived = workOrderInvoiceLines(job.items, source?.quotation?.lines ?? []);
    const lines = data.lines ?? derived.lines;

    if (!data.lines && derived.unpriced.length > 0) {
      return NextResponse.json(
        {
          error: "Some of the work done has no price behind it",
          code: "NEEDS_PRICES",
          unpriced: derived.unpriced,
          /** What could be priced, so the caller can fill in the rest rather than retype it. */
          lines: derived.lines,
        },
        { status: 409 },
      );
    }
    if (lines.length === 0) {
      return errorResponse("There is nothing on this job to bill", 400);
    }

    // Claim the job before billing it.
    //
    // The invoice is written by the accounting bridge in its own transaction
    // and only afterwards can the link be filed against the job, so two
    // presses a second apart both read a job with no invoice on it and the
    // customer was billed twice. The read and the write of the claim are one
    // transaction, and the write is conditional on the row not having moved
    // since the read — so exactly one of two racing requests wins it.
    const claimedAt = new Date();
    const claim = await prisma.$transaction(async (tx) => {
      const fresh = await tx.crmWorkOrder.findFirst({
        where: { id, companyId },
        select: { customFields: true, updatedAt: true },
      });
      if (!fresh) return "GONE" as const;
      if (readInvoiceLink(fresh.customFields)) return "BILLED" as const;
      if (isClaimHeld(readInvoiceClaim(fresh.customFields), claimedAt)) return "BUSY" as const;

      const { count } = await tx.crmWorkOrder.updateMany({
        where: { id, companyId, updatedAt: fresh.updatedAt },
        data: {
          customFields: writeInvoiceClaim(fresh.customFields, {
            claimedAt: claimedAt.toISOString(),
            userId: session.user.id,
          }) as Prisma.InputJsonObject,
        },
      });
      return count === 1 ? ("WON" as const) : ("BUSY" as const);
    });

    if (claim === "GONE") return errorResponse("Job not found", 404);
    if (claim === "BILLED") {
      // Somebody billed it between the check at the top of this request and
      // here. Their invoice is the answer, the same as a second press gets.
      const raced = await existingInvoice(companyId, await reloadForClaim(companyId, id), job.workOrderNo);
      const described = raced ? await describeDocument(companyId, raced.documentId) : null;
      return successResponse({ ...described, alreadyInvoiced: true }, 200);
    }
    if (claim === "BUSY") {
      return NextResponse.json(
        {
          error: "This job is being invoiced right now — give it a moment",
          code: "INVOICE_IN_FLIGHT",
        },
        { status: 409 },
      );
    }

    let result: Awaited<ReturnType<typeof createInvoiceForLead>>;
    try {
      result = await createInvoiceForLead({
        companyId,
        userId: session.user.id,
        dealId: job.dealId!,
        lines,
        currency: data.currency ?? source?.currency,
        notes: invoiceNoteFor(job.workOrderNo, data.notes ?? job.title),
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        renderTemplateId: data.renderTemplateId ?? null,
      });
    } catch (error) {
      // Nothing was billed, so the claim has to come off — a job stuck behind
      // a claim nobody holds is unbillable until the claim expires.
      await releaseClaim(companyId, id);
      throw error;
    }

    const link: WorkOrderInvoiceLink = {
      documentId: result.leadDocumentId,
      invoiceId: result.invoiceId,
      invoiceNumber: result.invoiceNumber,
      invoicedAt: new Date().toISOString(),
    };
    // Read back rather than reusing the copy loaded at the top: the claim was
    // written to `customFields` in between, and writing the stale copy would
    // put the claim back on a job that has just been billed.
    const claimed = await reloadForClaim(companyId, id);
    await prisma.crmWorkOrder.update({
      where: { id },
      data: {
        customFields: writeInvoiceLink(claimed.customFields, link) as Prisma.InputJsonObject,
      },
    });

    await recordJobActivity(prisma, {
      companyId,
      userId: session.user.id,
      job,
      refs: jobRecordRefs(job),
      type: "DOCUMENT_CREATED",
      subject: `Invoice ${result.invoiceNumber} raised from work order ${job.workOrderNo}`,
      metadata: {
        kind: "WORK_ORDER_INVOICE",
        documentId: result.leadDocumentId,
        invoiceId: result.invoiceId,
        total: result.total,
      },
    });

    return successResponse(
      {
        documentId: result.leadDocumentId,
        invoiceId: result.invoiceId,
        invoiceNumber: result.invoiceNumber,
        total: result.total,
        currency: data.currency ?? source?.currency ?? "USD",
        alreadyInvoiced: false,
        lines,
      },
      201,
    );
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    // The bridge refuses some invoices on purpose, in a sentence written for
    // whoever pressed the button — those are the caller's problem and go back
    // as one. Anything else is a database message or a bug, and forwarding
    // raw Prisma text to a browser as a 400 tells the user their input was
    // wrong when it wasn't, and leaks the schema while doing it.
    if (error instanceof Error && isBillingRefusal(error.message)) {
      return errorResponse(error.message, 400);
    }
    console.error("[API] POST /api/v2/crm/work-orders/[id]/invoice error:", error);
    return errorResponse("Failed to raise the invoice");
  }
}

/** What raising the invoice would do, without doing it. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { id } = await params;

    const job = await loadJobForAction(companyId, id);
    if (!job) return errorResponse("Job not found", 404);

    const already = await existingInvoice(companyId, job, job.workOrderNo);
    if (already) {
      const described = await describeDocument(companyId, already.documentId);
      return successResponse({ ...described, alreadyInvoiced: true, blockers: [], unpriced: [] });
    }

    const source = job.documentId
      ? await prisma.crmLeadDocument.findFirst({
          where: { id: job.documentId, companyId },
          select: {
            currency: true,
            quotation: {
              select: { lines: { select: { description: true, unitPrice: true, taxRate: true } } },
            },
          },
        })
      : null;
    const derived = workOrderInvoiceLines(job.items, source?.quotation?.lines ?? []);

    return successResponse({
      alreadyInvoiced: false,
      blockers: workOrderInvoiceBlockers(job),
      currency: source?.currency ?? "USD",
      lines: derived.lines,
      unpriced: derived.unpriced,
      // Indicative, and named so. The accounting bridge rounds tax per line
      // when it raises the real thing, so this can sit a cent away from it.
      estimatedTotal: derived.lines.reduce(
        (sum, line) => sum + line.quantity * line.unitPrice * (1 + line.taxRate / 100),
        0,
      ),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/work-orders/[id]/invoice error:", error);
    return errorResponse("Failed to preview the invoice");
  }
}
