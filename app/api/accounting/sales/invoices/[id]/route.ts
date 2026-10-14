import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { createJournalEntryFromSource } from "@/lib/accounting/posting";
import { issueFiscalReceipt } from "@/lib/accounting/fiscalisation";
import { hasFeature } from "@/lib/platform/features";
import { onAccountingInvoiceCreated } from "@/lib/crm/accounting-hooks";
import { asMineSchema, datesOnIssue, takeOn, VaneDraftNotTakenOn, waitsForAPerson } from "@/lib/vane/drafts";

const updateSchema = z.object({
  status: z.enum(["DRAFT", "ISSUED", "PAID", "VOIDED"]).optional(),
  notes: z.string().max(1000).optional(),
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

    if (validated.status === "VOIDED" && session.user.role !== "SUPERADMIN") {
      return errorResponse("Only superadmin can cancel an invoice", 403);
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
      try {
        await createJournalEntryFromSource({
          companyId: session.user.companyId,
          sourceType: "SALES_INVOICE",
          sourceId: updated.id,
          entryDate: updated.invoiceDate,
          description: `Sales invoice ${updated.invoiceNumber}`,
          createdById: session.user.id,
          amount: updated.total,
          netAmount: updated.subTotal,
          taxAmount: updated.taxTotal,
          grossAmount: updated.total,
        });
      } catch (error) {
        console.error("[Accounting] Sales invoice auto-post failed:", error);
      }

      const fiscalEnabled = await hasFeature(session.user.companyId, "accounting.zimra.fiscalisation");
      if (fiscalEnabled) {
        try {
          await issueFiscalReceipt(session.user.companyId, updated.id, session.user.id);
        } catch (error) {
          console.error("[Accounting] Fiscalisation issue failed:", error);
        }
      }
    }

    if (
      validated.status === "VOIDED" &&
      existing.status !== "VOIDED" &&
      (existing.status === "ISSUED" || existing.status === "PAID")
    ) {
      try {
        const postedEntry = await prisma.journalEntry.findFirst({
          where: {
            companyId: session.user.companyId,
            sourceType: "SALES_INVOICE",
            sourceId: updated.id,
            status: "POSTED",
          },
          select: { id: true },
        });
        if (postedEntry) {
          await createJournalEntryFromSource({
            companyId: session.user.companyId,
            sourceType: "SALES_INVOICE",
            sourceId: `void:${updated.id}`,
            entryDate: new Date(),
            description: `Void sales invoice ${updated.invoiceNumber}`,
            createdById: session.user.id,
            amount: updated.total,
            netAmount: updated.subTotal,
            taxAmount: updated.taxTotal,
            grossAmount: updated.total,
            invertDirection: true,
          });
        }
      } catch (error) {
        console.error("[Accounting] Sales invoice void reversal failed:", error);
      }
    }

    return successResponse(updated);
  } catch (error) {
    if (error instanceof VaneDraftNotTakenOn) return errorResponse(error.message, error.status);
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/accounting/sales/invoices/[id] error:", error);
    return errorResponse("Failed to update sales invoice");
  }
}
