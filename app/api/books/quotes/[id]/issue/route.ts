import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { guardBooks } from "@/lib/books/core";
import { numberAtIssue } from "@/lib/books/core/numbering";
import { docLabel } from "@/lib/books/doc-number";
import { prisma } from "@/lib/prisma";
import { asMineSchema, takeOn, VaneDraftNotTakenOn, waitsForAPerson } from "@/lib/vane/drafts";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { refused } = await guardBooks(session, "issue", { kind: "quotation" });
    if (refused) return refused;

    const body = (await request.json().catch(() => ({}))) as { asMine?: unknown } | null;
    const asMine = asMineSchema.safeParse(body?.asMine);
    if (!asMine.success) return errorResponse("asMine is true or false", 400);

    const id = (await params).id;
    const companyId = session.user.companyId;
    const userId = session.user.id;
    const now = new Date();

    const draft = await prisma.salesQuotation.findFirst({
      where: { companyId, OR: [{ id }, { crmLeadDocuments: { some: { id } } }] },
      select: { id: true, quotationNumber: true, status: true, madeByVane: true, createdById: true, customer: { select: { name: true } } },
    });
    if (!draft) return errorResponse("That quote is not here any more.", 404);
    if (draft.status !== "DRAFT") {
      return errorResponse(`${docLabel(draft.quotationNumber, "quote")} is not a draft: it was issued already.`, 409);
    }

    const takingOn = waitsForAPerson(draft);
    const maker = takingOn ? takeOn(draft, { asMine: asMine.data, userId, what: docLabel(draft.quotationNumber, "quote"), verb: "issue" }) : {};

    const issuedNumber = await prisma.$transaction(async (tx) => {
      const locked = await tx.salesQuotation.updateMany({
        where: { id: draft.id, companyId, status: "DRAFT" },
        data: {
          status: "SENT",
          issuedById: userId,
          issuedAt: now,
          ...(takingOn ? { ...maker, quotationDate: now } : {}),
        },
      });
      if (locked.count === 0) return null;
      const nextNum = await numberAtIssue(tx, companyId, "quotation", draft.quotationNumber);
      if (nextNum !== draft.quotationNumber) {
        await tx.salesQuotation.update({ where: { id: draft.id }, data: { quotationNumber: nextNum } });
      }
      if (takingOn) {
        await tx.crmLeadDocument.updateMany({
          where: { quotationId: draft.id, companyId, createdById: null },
          data: { createdById: userId },
        });
      }
      return nextNum;
    });

    if (!issuedNumber) {
      return errorResponse(`${docLabel(draft.quotationNumber, "quote")} was already issued.`, 409);
    }

    return successResponse({ id: draft.id, number: issuedNumber, customer: draft.customer.name });
  } catch (error) {
    if (error instanceof VaneDraftNotTakenOn) return errorResponse(error.message, error.status);
    console.error("[API] POST /api/books/quotes/[id]/issue error:", error);
    return errorResponse("Could not issue the quote");
  }
}
