import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { deleteDraftBill, keepBillPhoto, replaceDraftLines, voidBill } from "@/lib/books/bill-actions";
import { readBillRecord } from "@/lib/books/bill-record";
import { booksActor, canDo, guardBooks } from "@/lib/books/core";
import { approveBill, checkBillFti, recordBill } from "@/lib/books/core/bills";
import { refusedResponse } from "@/lib/books/core/refused";
import { moneyLimits } from "@/lib/books/core/approvals";
import { tierOf } from "@/lib/books/core/can-do";
import { prisma } from "@/lib/prisma";
import { AttachmentRefusal } from "@/lib/retail/buying/attachments";

/**
 * One bill in Books (BkBill): read it with what this person may do, and its
 * moves through the core (books-final §4.8): record a draft (its FTI and FDMS
 * check, D16), the owner's approval over the payments limit, the FDMS check
 * on its own, void, delete a draft, and its photo.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { actor, refused } = await guardBooks(sessionResult.session, "view", { area: "bills" });
    if (refused) return refused;
    const { id } = await params;
    const record = await readBillRecord(prisma, actor.companyId, id);
    if (!record) return errorResponse("Purchase bill not found", 404);
    const bill = await prisma.purchaseBill.findUniqueOrThrow({ where: { id }, select: { createdById: true, issuedById: true, approvedById: true, total: true } });
    const limits = await moneyLimits(actor.companyId);
    const draft = record.status === "DRAFT";
    const needsApproval = draft && bill.total > limits.paymentOwnerOver + 0.004 && !bill.approvedById;
    const waiting = record.payments.find((payment) => payment.status === "TO_APPROVE") ?? null;
    const approvable = record.payments.find((payment) => payment.status === "APPROVED") ?? null;
    return successResponse({
      ...record,
      limit: limits.paymentOwnerOver,
      owner: limits.ownerApprover?.name ?? null,
      can: {
        record: draft && canDo(actor, "issue", { kind: "bill" }).allowed && (!needsApproval || tierOf(actor) === "owner"),
        approve: needsApproval && canDo(actor, "approve", { kind: "bill", ownerId: bill.createdById }).allowed,
        check: record.status !== "VOIDED" && canDo(actor, draft ? "draft.edit" : "issue", { kind: "bill", ownerId: bill.createdById }).allowed,
        pay: (record.status === "RECEIVED" && record.balance > 0.005 && canDo(actor, "draft.create", { kind: "payment" }).allowed) || false,
        approvePayment: waiting ? { id: waiting.id, number: waiting.number, allowed: canDo(actor, "approve", { kind: "payment" }).allowed } : null,
        payApproved: approvable ? { id: approvable.id, allowed: canDo(actor, "pay", { kind: "payment" }).allowed } : null,
        note: record.status === "RECEIVED" && canDo(actor, "note.issue", { kind: "debit-note" }).allowed,
        writeOff: record.status === "RECEIVED" && record.balance > 0.005 && canDo(actor, "write-off", { kind: "write-off" }).allowed,
        void: !draft && record.status !== "VOIDED" && canDo(actor, "void", { kind: "bill", ownerId: bill.issuedById }).allowed,
        delete: draft && canDo(actor, "draft.delete", { kind: "bill", ownerId: bill.createdById }).allowed,
      },
    });
  } catch (error) {
    console.error("[API] GET /api/books/bills/[id] error:", error);
    return errorResponse("Could not read the bill");
  }
}

const fileSchema = z.object({ url: z.string().min(1).max(2000), name: z.string().max(200), contentType: z.string().max(100), size: z.number().positive() });

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("record"),
    supplierFtiNumber: z.string().trim().max(60).nullable().optional(),
    fdmsStatus: z.enum(["NOT_CHECKED", "VALID", "NOT_VALID"]).optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    costCenterId: z.string().uuid().nullable().optional(),
  }),
  z.object({ action: z.literal("approve"), note: z.string().trim().max(1000).optional() }),
  z.object({ action: z.literal("check"), status: z.enum(["NOT_CHECKED", "VALID", "NOT_VALID"]), supplierFtiNumber: z.string().trim().max(60).nullable().optional() }),
  z.object({ action: z.literal("void"), reason: z.string().trim().min(3).max(300) }),
  z.object({ action: z.literal("photo"), file: fileSchema }),
  z.object({
    action: z.literal("lines"),
    lines: z.array(z.object({ description: z.string().trim().min(1).max(300), quantity: z.number().positive(), unitPrice: z.number().min(0), taxCodeId: z.string().uuid().nullable().optional() })).min(1).max(200),
  }),
]);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { id } = await params;
    const body = actionSchema.parse(await request.json());
    const actor = await booksActor(sessionResult.session);
    switch (body.action) {
      case "record": {
        if (body.dueDate !== undefined) {
          const draft = await prisma.purchaseBill.findFirst({ where: { id, companyId: actor.companyId, status: "DRAFT" }, select: { id: true } });
          if (draft) await prisma.purchaseBill.update({ where: { id }, data: { dueDate: body.dueDate ? new Date(`${body.dueDate}T00:00:00.000Z`) : null } });
        }
        const { bill } = await recordBill(actor, id, { supplierFtiNumber: body.supplierFtiNumber, fdmsStatus: body.fdmsStatus, costCenterId: body.costCenterId ?? null });
        return successResponse({ id: bill.id, number: bill.billNumber, status: bill.status });
      }
      case "approve":
        return successResponse(await approveBill(actor, id, body.note));
      case "check":
        return successResponse(await checkBillFti(actor, id, { status: body.status, supplierFtiNumber: body.supplierFtiNumber }));
      case "void":
        return successResponse(await voidBill(actor, id, body.reason));
      case "photo":
        return successResponse(await keepBillPhoto(actor, id, body.file), 201);
      case "lines":
        return successResponse(await replaceDraftLines(actor, id, body.lines));
    }
  } catch (error) {
    if (error instanceof AttachmentRefusal) return errorResponse(error.message, 400);
    const refused = refusedResponse(error, "Check what was sent: something in it is not filled in right.");
    if (refused) return refused;
    console.error("[API] PATCH /api/books/bills/[id] error:", error);
    return errorResponse("Could not change the bill");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { id } = await params;
    return successResponse(await deleteDraftBill(await booksActor(sessionResult.session), id));
  } catch (error) {
    const refused = refusedResponse(error);
    if (refused) return refused;
    console.error("[API] DELETE /api/books/bills/[id] error:", error);
    return errorResponse("Could not delete the bill");
  }
}
