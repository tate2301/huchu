import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { issueFiscalReceipt } from "@/lib/accounting/fiscalisation";
import { prisma } from "@/lib/prisma";
import { VaneDraftNotTakenOn, waitsForAPerson } from "@/lib/vane/drafts";

const issueSchema = z.object({
  invoiceId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = issueSchema.parse(body);

    // A fiscal receipt reports the invoice to ZIMRA: never for Vane's draft before a person has issued it as theirs.
    const invoice = await prisma.salesInvoice.findFirst({
      where: { id: validated.invoiceId, companyId: session.user.companyId },
      select: { invoiceNumber: true, madeByVane: true, createdById: true },
    });
    if (invoice && waitsForAPerson(invoice)) {
      const refused = new VaneDraftNotTakenOn(invoice.invoiceNumber, "issue");
      return errorResponse(refused.message, refused.status);
    }

    const result = await issueFiscalReceipt(session.user.companyId, validated.invoiceId, session.user.id);

    if (result.status === "FAILED") {
      return errorResponse(result.error ?? "Failed to issue fiscal receipt", 400);
    }

    return successResponse(result, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/fiscalisation/issue error:", error);
    return errorResponse("Failed to issue fiscal receipt");
  }
}
