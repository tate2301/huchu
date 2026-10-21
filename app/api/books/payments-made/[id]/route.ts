import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor, canDo, guardBooks, voidDocument } from "@/lib/books/core";
import { approvedByOwner, decideApproval, decidePayment, moneyLimits, otherOwners, othersWhoCan } from "@/lib/books/core/approvals";
import { readPaymentOutRecord } from "@/lib/books/payment-out-record";
import { prisma } from "@/lib/prisma";
import { refusedResponse } from "@/lib/books/core/refused";
import {
  decideSupplierPayment,
  deleteUnpaidSupplierPayment,
  paySupplierPayment,
  submitSupplierPayment,
} from "@/lib/books/core/supplier-payments";

/** A supplier payment's moves (D5, books-final §4.10): send for approval, approve or send back, pay, void. */
const actionSchema = z.object({
  action: z.enum(["submit", "approve", "reject", "pay", "void"]),
  note: z.string().trim().max(1000).nullable().optional(),
  reason: z.string().trim().min(3).max(300).optional(),
});

/** One payment made (BkPaymentMade): its record, with what this person may do next and why not. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { actor, refused } = await guardBooks(sessionResult.session, "view", { area: "bills" });
    if (refused) return refused;
    const { id } = await params;
    const record = await readPaymentOutRecord(prisma, actor.companyId, id);
    if (!record) return errorResponse("Payment not found", 404);
    const limits = await moneyLimits(actor.companyId);
    const row = await prisma.purchasePayment.findUniqueOrThrow({ where: { id }, select: { approvalLimit: true, amount: true, createdById: true, approvedById: true, requisitionId: true } });
    const limit = row.approvalLimit != null ? Number(row.approvalLimit) : limits.paymentOwnerOver;
    const asked = { kind: "payment" as const, amount: row.amount, currency: record.currency };
    const approve =
      record.status === "TO_APPROVE"
        ? decideApproval(actor, { ...asked, requestedById: row.createdById, limit }, {
            othersWhoCanApprove: await othersWhoCan(prisma, actor.companyId, { except: [row.createdById] }),
            otherOwners: await otherOwners(prisma, actor.companyId, [row.createdById]),
            ownerName: limits.ownerApprover?.name ?? null,
          })
        : { allowed: false as const, reason: null };
    const pay =
      record.status === "APPROVED"
        ? decidePayment(actor, { ...asked, requestedById: null, approvedById: row.approvedById, ownerApproved: await approvedByOwner(prisma, actor.companyId, row.approvedById), limit: limits.paymentOwnerOver }, { othersWhoCanPay: await othersWhoCan(prisma, actor.companyId, { except: [actor.userId] }) })
        : { allowed: false as const, reason: null };
    const unpaid = record.status === "DRAFT" || record.status === "TO_APPROVE" || record.status === "APPROVED";
    return successResponse({
      ...record,
      can: {
        submit: record.status === "DRAFT" && canDo(actor, "draft.create", { kind: "payment" }).allowed,
        approve: { allowed: approve.allowed, reason: approve.allowed ? null : (approve.reason ?? null) },
        pay: { allowed: pay.allowed, reason: pay.allowed ? null : (pay.reason ?? null) },
        void: record.status === "PAID" && !row.requisitionId && canDo(actor, "void", { kind: "payment" }).allowed,
        delete: unpaid && (row.createdById === actor.userId || canDo(actor, "approve", { kind: "payment" }).allowed),
      },
      me: actor.userId,
    });
  } catch (error) {
    console.error("[API] GET /api/books/payments-made/[id] error:", error);
    return errorResponse("Could not read the payment");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { id } = await params;
    const body = actionSchema.parse(await request.json());
    const actor = await booksActor(sessionResult.session);
    switch (body.action) {
      case "submit":
        return successResponse(await submitSupplierPayment(actor, id));
      case "approve":
      case "reject":
        return successResponse(await decideSupplierPayment(actor, id, { approve: body.action === "approve", note: body.note }));
      case "pay":
        return successResponse(await paySupplierPayment(actor, id));
      case "void":
        if (!body.reason) return errorResponse("Say why, in a few words. The reason is kept in the audit trail.", 400);
        return successResponse(await voidDocument(actor, "payment", id, { reason: body.reason }));
    }
  } catch (error) {
    const refused = refusedResponse(error);
    if (refused) return refused;
    console.error("[API] PATCH /api/books/payments-made/[id] error:", error);
    return errorResponse("Could not change the payment");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { id } = await params;
    return successResponse(await deleteUnpaidSupplierPayment(await booksActor(sessionResult.session), id));
  } catch (error) {
    const refused = refusedResponse(error);
    if (refused) return refused;
    console.error("[API] DELETE /api/books/payments-made/[id] error:", error);
    return errorResponse("Could not delete the payment");
  }
}
