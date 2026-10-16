import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { postIssuedInvoice } from "@/lib/books/issue-invoice";
import { InvoiceChangeRefused, isWorkspaceOwner } from "@/lib/books/owner";
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

    // Voiding is the workspace owner's (`lib/books/owner.ts`), and goes the one way Books' Reverse goes.
    if (validated.status === "VOIDED") {
      if (!isWorkspaceOwner(session.user.role)) return errorResponse("Only the workspace's owner can void an invoice", 403);
      await voidInvoice(
        { companyId: session.user.companyId, userId: session.user.id, role: session.user.role },
        id,
        { reason: validated.reason ?? "Cancelled in Accounting, Sales", source: "accounting.sales" },
      );
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

    // Issued or paid is the invoice leaving the drafts and being posted. Vane's
    // draft goes only once a person confirms it as theirs; then it is theirs,
    // dated the day they issue it, in this same write.
    const leaving =
      existing.status === "DRAFT" && (validated.status === "ISSUED" || validated.status === "PAID");
    const takingOn = leaving && waitsForAPerson(existing);
    const maker = leaving
      ? takeOn(existing, { asMine: validated.asMine, userId: session.user.id, what: existing.invoiceNumber, verb: "issue" })
      : {};
    const now = new Date();

    const updated = await prisma.salesInvoice.update({
      where: { id },
      data: {
        status: validated.status,
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
