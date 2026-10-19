import { NextRequest, NextResponse } from "next/server";
import { docLabel } from "@/lib/books/doc-number";
import { z } from "zod";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { postIssuedInvoice } from "@/lib/books/issue-invoice";
import { guardBooks } from "@/lib/books/core";
import { InvoiceChangeRefused } from "@/lib/books/owner";
import { voidInvoice } from "@/lib/books/reverse-invoice";
import { onAccountingInvoiceCreated } from "@/lib/crm/accounting-hooks";
import { asMineSchema, datesOnIssue, takeOn, VaneDraftNotTakenOn, waitsForAPerson } from "@/lib/vane/drafts";

const updateSchema = z.object({
  status: z.enum(["DRAFT", "ISSUED", "PAID", "VOIDED"]).optional(),
  notes: z.string().max(1000).optional(),
  /** Why it is voided: kept on the audit event. */
  reason: z.string().trim().min(3).max(300).optional(),
  /** Confirms Vane's draft as the person's own as it is issued: they become its maker in the same write. */
  asMine: asMineSchema,
});

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const body = await request.json();
    const validated = updateSchema.parse(body);

    // Voiding goes the one way Books' Reverse goes, for whoever may void (books-final §2.2).
    if (validated.status === "VOIDED") {
      const { actor, refused } = await guardBooks(session, "void", { kind: "invoice" });
      if (refused) return refused;
      await voidInvoice(actor, id, { reason: validated.reason ?? "Cancelled in Accounting, Sales", source: "accounting.sales" });
      const voided = await prisma.salesInvoice.findUnique({ where: { id }, include: { customer: true, lines: true } });
      return successResponse(voided);
    }

    const existing = await prisma.salesInvoice.findUnique({
      where: { id },
      include: { lines: true },
    });

    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Invoice not found", 404);
    }

    // No arbitrary status jumps (books-final §4.1): a draft is issued, an issued one is voided.
    // Paid and part-paid are worked out from the payments, and nothing goes back to draft.
    if (validated.status === "PAID") {
      return errorResponse("Paid is worked out from the payments on it. Record a payment instead.", 409);
    }
    if (validated.status === "DRAFT" && existing.status !== "DRAFT") {
      return errorResponse(`${existing.invoiceNumber} was issued, so it cannot go back to draft. Void it, or credit it.`, 409);
    }
    if (validated.status === "ISSUED" && existing.status !== "DRAFT") {
      return errorResponse(`${existing.invoiceNumber} is not a draft: it was issued already.`, 409);
    }
    const { refused } = await guardBooks(session, validated.status === "ISSUED" ? "issue" : "draft.edit", {
      kind: "invoice",
      ownerId: existing.createdById,
    });
    if (refused) return refused;

    // Issued or paid is the invoice leaving the drafts and being posted. Vane's
    // draft goes only once a person confirms it as theirs; then it is theirs,
    // dated the day they issue it, in this same write.
    const leaving = existing.status === "DRAFT" && validated.status === "ISSUED";
    const takingOn = leaving && waitsForAPerson(existing);
    const maker = leaving
      ? takeOn(existing, { asMine: validated.asMine, userId: session.user.id, what: docLabel(existing.invoiceNumber), verb: "issue" })
      : {};
    const now = new Date();

    const updated = await prisma.salesInvoice.update({
      where: { id },
      data: {
        status: validated.status === "ISSUED" ? "ISSUED" : undefined,
        notes: validated.notes,
        issuedById: validated.status === "ISSUED" ? session.user.id : existing.issuedById,
        issuedAt: validated.status === "ISSUED" ? now : existing.issuedAt,
        ...maker,
        ...(takingOn ? datesOnIssue(existing, now) : {}),
      },
      include: { customer: true, lines: true },
    });

    // The CRM hears of an invoice raised off its quote when it is made; Vane's draft, when a person takes it on.
    if (takingOn) {
      await onAccountingInvoiceCreated({ companyId: session.user.companyId, invoiceId: updated.id, userId: session.user.id });
    }

    if (validated.status === "ISSUED" && existing.status !== "ISSUED") {
      await postIssuedInvoice(session.user.companyId, updated, session.user.id);
    }

    return successResponse(updated);
  } catch (error) {
    if (error instanceof VaneDraftNotTakenOn) return errorResponse(error.message, error.status);
    if (error instanceof InvoiceChangeRefused) return errorResponse(error.message, error.status);
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/accounting/sales/invoices/[id] error:", error);
    return errorResponse("Failed to update sales invoice");
  }
}
