import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { writeSchoolAuditEvent } from "../../../../../../audit";
import { schoolPermissionDenial } from "../../../../../../permissions";
import {
  exceeds,
  money,
  toBaseAmount,
  toNumberOrZero,
} from "../../../../../../money";
import { refreshFeeInvoiceBalance } from "../../../../../../fees-posting";

/**
 * One waiver: correct it, move it along its states, or throw a draft away.
 *
 * `SchoolFeeWaiverStatus` has five values and the product could reach two of
 * them. Creating a waiver made a DRAFT; `[id]/apply` made an APPLIED. APPROVED,
 * REJECTED and REVERSED existed in the schema, in the badge switch on the
 * ledger and nowhere else — so a head who wanted to sign a bursary off without
 * applying it, a bursar who wanted to turn one down, and anyone who had applied
 * one to the wrong bill all had the same recourse, which was none.
 *
 * The transitions this allows, and why they stop where they do:
 *
 *   DRAFT     → APPROVED  the decision is taken; the discount is not on a bill yet
 *   DRAFT     → REJECTED  turned down before it ever touched an invoice
 *   APPROVED  → REJECTED  signed off and then reconsidered, before applying
 *   APPLIED   → REVERSED  taken back off the bill it discounted
 *
 * APPLIED is not reachable from here — that is `[id]/apply`, which has to pick
 * the invoice, check the currency and the balance, refresh the bill and emit
 * the accounting event. Two paths into the same state would eventually
 * disagree about one of those.
 *
 * Reversing does the one piece of arithmetic in this file, and it does none of
 * it by hand: `refreshFeeInvoiceBalance` re-adds the invoice from its lines,
 * its posted allocations and its *applied* waivers, so a waiver that stops
 * being applied simply stops counting and the family owes the money again.
 */

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Which audit event a status change writes.
 *
 * Spelled out rather than built from the enum value, so the audit vocabulary
 * stays a closed set somebody can grep for — and because these five are not
 * interchangeable: approving and applying take money off a bill, rejecting and
 * reversing put it back on.
 */
const WAIVER_STATUS_EVENT = {
  DRAFT: "schools.fee.waiver.edited",
  APPROVED: "schools.fee.waiver.approved",
  APPLIED: "schools.fee.waiver.applied",
  REJECTED: "schools.fee.waiver.rejected",
  REVERSED: "schools.fee.waiver.reversed",
} as const;

const patchSchema = z
  .object({
    waiverType: z.enum(["SCHOLARSHIP", "DISCOUNT", "HARDSHIP", "OTHER"]).optional(),
    amount: z.number().finite().positive().optional(),
    invoiceId: z.string().uuid().nullable().optional(),
    reason: z.string().trim().max(500).nullable().optional(),
    /** APPLIED is deliberately absent — see the header. */
    status: z.enum(["APPROVED", "REJECTED", "REVERSED"]).optional(),
  })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    "Nothing to change",
  );

const waiverInclude = {
  student: {
    select: { id: true, studentNo: true, firstName: true, lastName: true },
  },
  term: { select: { id: true, code: true, name: true } },
  invoice: {
    select: { id: true, invoiceNo: true, status: true, balanceAmount: true },
  },
};

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["APPROVED", "REJECTED"],
  APPROVED: ["REJECTED"],
  APPLIED: ["REVERSED"],
  REJECTED: [],
  REVERSED: [],
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.fees", "view");
    if (denied) return errorResponse(denied, 403);
    const { id } = await params;

    const waiver = await prisma.schoolFeeWaiver.findFirst({
      where: { id, companyId: session.user.companyId },
      include: waiverInclude,
    });
    if (!waiver) return errorResponse("Fee waiver not found", 404);

    return successResponse(waiver);
  } catch (error) {
    console.error("[API] GET /api/v2/schools/fees/waivers/[id] error:", error);
    return errorResponse("Failed to fetch fee waiver");
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    // `waive` throughout, matching the sibling `[id]/apply`. Approving and
    // rejecting are steps in the same act as applying, and splitting them onto
    // the `approve` grant — which no persona holds on `schools.fees` — would
    // leave the bursar unable to finish work they are the only one who starts.
    const denied = schoolPermissionDenial(session, "schools.fees", "waive");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;
    const { id } = await params;

    const body = await request.json();
    const validated = patchSchema.parse(body);

    const existing = await prisma.schoolFeeWaiver.findFirst({
      where: { id, companyId },
    });
    if (!existing) return errorResponse("Fee waiver not found", 404);

    const nextStatus = validated.status ?? existing.status;
    if (validated.status && validated.status !== existing.status) {
      const permitted = ALLOWED_TRANSITIONS[existing.status] ?? [];
      if (!permitted.includes(validated.status)) {
        return errorResponse(
          `A ${existing.status.toLowerCase()} waiver cannot become ${validated.status.toLowerCase()}`,
          400,
        );
      }
    }

    const editsFields =
      validated.waiverType !== undefined ||
      validated.amount !== undefined ||
      validated.invoiceId !== undefined;

    // An applied waiver has already come off a bill; changing its amount would
    // silently restate what a family owes without anything on the invoice
    // recording it. Reverse it and write a new one.
    if (editsFields && existing.status !== "DRAFT") {
      return errorResponse(
        "Only a draft waiver can be re-typed. Reverse this one and raise another.",
        400,
      );
    }

    let invoiceIdToSet = existing.invoiceId;
    if (validated.invoiceId !== undefined) {
      if (validated.invoiceId === null) {
        invoiceIdToSet = null;
      } else {
        const invoice = await prisma.schoolFeeInvoice.findFirst({
          where: {
            id: validated.invoiceId,
            companyId,
            studentId: existing.studentId,
            termId: existing.termId,
          },
          select: { id: true, currency: true, balanceAmount: true },
        });
        if (!invoice) {
          return errorResponse("Invalid invoice for this pupil and term", 400);
        }
        if (invoice.currency !== existing.currency) {
          return errorResponse("Waiver currency does not match the invoice currency", 400);
        }
        // Post S-2.1 Float→Decimal: an exact comparison, no epsilon fudge.
        if (exceeds(validated.amount ?? existing.amount, invoice.balanceAmount)) {
          return errorResponse("Waiver amount exceeds invoice outstanding balance", 400);
        }
        invoiceIdToSet = invoice.id;
      }
    }

    const amount =
      validated.amount !== undefined ? money(validated.amount) : existing.amount;
    const reversing = validated.status === "REVERSED";
    const approving = validated.status === "APPROVED";
    const reversedFromInvoiceId = reversing ? existing.invoiceId : null;

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.schoolFeeWaiver.update({
        where: { id: existing.id },
        data: {
          ...(validated.waiverType !== undefined ? { waiverType: validated.waiverType } : {}),
          ...(validated.amount !== undefined
            ? { amount, baseAmount: toBaseAmount(amount, existing.exchangeRate) }
            : {}),
          ...(validated.invoiceId !== undefined ? { invoiceId: invoiceIdToSet } : {}),
          ...(validated.reason !== undefined ? { reason: validated.reason } : {}),
          ...(validated.status !== undefined ? { status: validated.status } : {}),
          ...(approving
            ? {
                approvedById: existing.approvedById ?? session.user.id,
                approvedAt: existing.approvedAt ?? new Date(),
              }
            : {}),
        },
      });

      // The discount has stopped counting; the bill it was on has to be told.
      let balanceAfter: number | null = null;
      if (reversedFromInvoiceId) {
        const refreshed = await refreshFeeInvoiceBalance(tx, {
          companyId,
          invoiceId: reversedFromInvoiceId,
        });
        if (!refreshed) throw new Error("Failed to refresh invoice after reversing waiver");
        balanceAfter = toNumberOrZero(refreshed.balanceAmount);
      }

      // S-2.8. Every one of these states changes what a family owes or records
      // a decision about whether it should, so each is written down with the
      // transaction that made it rather than after it.
      await writeSchoolAuditEvent(tx, {
        companyId,
        actorId: session.user.id,
        eventType:
          validated.status && validated.status !== existing.status
            ? WAIVER_STATUS_EVENT[validated.status]
            : "schools.fee.waiver.edited",
        entityType: "SchoolFeeWaiver",
        entityId: saved.id,
        reason: validated.reason ?? existing.reason ?? undefined,
        payload: {
          studentId: saved.studentId,
          termId: saved.termId,
          invoiceId: saved.invoiceId,
          waiverType: saved.waiverType,
          currency: saved.currency,
          statusBefore: existing.status,
          statusAfter: nextStatus,
          // Decimal columns, coerced at the JSON boundary on purpose.
          amountBefore: toNumberOrZero(existing.amount),
          amountAfter: toNumberOrZero(saved.amount),
          balanceAfter,
        },
      });

      return tx.schoolFeeWaiver.findUnique({
        where: { id: saved.id },
        include: waiverInclude,
      });
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/v2/schools/fees/waivers/[id] error:", error);
    return errorResponse("Failed to update fee waiver");
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.fees", "waive");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;
    const { id } = await params;

    const existing = await prisma.schoolFeeWaiver.findFirst({
      where: { id, companyId },
    });
    if (!existing) return errorResponse("Fee waiver not found", 404);
    if (existing.status !== "DRAFT") {
      return errorResponse(
        "Only a draft can be discarded. Reject or reverse this one instead, so the decision stays on the record.",
        400,
      );
    }

    await prisma.$transaction(async (tx) => {
      await writeSchoolAuditEvent(tx, {
        companyId,
        actorId: session.user.id,
        eventType: "schools.fee.waiver.discarded",
        entityType: "SchoolFeeWaiver",
        entityId: existing.id,
        payload: {
          studentId: existing.studentId,
          termId: existing.termId,
          waiverType: existing.waiverType,
          currency: existing.currency,
          amount: toNumberOrZero(existing.amount),
        },
      });
      await tx.schoolFeeWaiver.delete({ where: { id: existing.id } });
    });

    return successResponse({ id: existing.id, deleted: true });
  } catch (error) {
    console.error("[API] DELETE /api/v2/schools/fees/waivers/[id] error:", error);
    return errorResponse("Failed to discard fee waiver");
  }
}
