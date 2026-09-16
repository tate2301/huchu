import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { getCurrentTerm } from "@/lib/schools/calendar";
import {
  buildEntryFile,
  candidateRoll,
  candidatesOutsideTheRule,
  entriesBySubject,
  enterSubject,
  ExamError,
  invoiceEntries,
} from "@/lib/schools/exams";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * Subject entries, and what they cost.
 *
 * Read two ways from one table — by subject and by candidate — because the two
 * questions are different: a bursar reconciling a board invoice wants the
 * subject totals, and an exams officer checking the rule wants the candidates.
 *
 * `POST` does three things depending on what it is asked, and each is a
 * separate act with its own grant: entering a subject needs `enter`, invoicing
 * needs `issue` (the bursar's), and building the entry file needs `enter`
 * again. **Building a file is not submitting it.** `SCH-DEP-02` defers the
 * board's API; a human uploads what comes back.
 */

const postSchema = z.union([
  z.object({
    candidateId: z.string().uuid(),
    examSubjectId: z.string().uuid(),
  }),
  z.object({ invoice: z.literal(true), termId: z.string().uuid().optional() }),
  z.object({ buildEntryFile: z.literal(true) }),
]);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ seriesId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.exams", "view");
    if (denied) return errorResponse(denied, 403);

    const { seriesId } = await context.params;
    const companyId = session.user.companyId;

    const [bySubject, byCandidate, rule] = await Promise.all([
      entriesBySubject({ companyId, seriesId }),
      candidateRoll({ companyId, seriesId }),
      candidatesOutsideTheRule({ companyId, seriesId }),
    ]);

    const totals = bySubject.reduce(
      (sums, row) => ({
        entries: sums.entries + row.entries,
        totalFee: sums.totalFee + Number(row.totalFee),
        invoiced: sums.invoiced + Number(row.invoiced),
        paid: sums.paid + Number(row.paid),
        toInvoice: sums.toInvoice + Number(row.toInvoice),
      }),
      { entries: 0, totalFee: 0, invoiced: 0, paid: 0, toInvoice: 0 },
    );

    return successResponse({
      bySubject,
      byCandidate,
      rule: {
        minimum: rule.rule.minimum,
        maximum: rule.rule.maximum,
        below: rule.below,
        over: rule.over,
      },
      totals: {
        entries: totals.entries,
        totalFee: totals.totalFee.toFixed(2),
        invoiced: totals.invoiced.toFixed(2),
        paid: totals.paid.toFixed(2),
        toInvoice: totals.toInvoice.toFixed(2),
      },
    });
  } catch (error) {
    console.error("[API] GET /api/v2/schools/exams/series/[id]/entries error:", error);
    return errorResponse("Failed to read the entries");
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ seriesId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { seriesId } = await context.params;
    const body = postSchema.parse(await request.json());
    const companyId = session.user.companyId;
    const actorId = session.user.id;

    if ("invoice" in body) {
      // The bursar's act, not the exams officer's: this puts money on a family's
      // bill.
      const denied = schoolPermissionDenial(session, "schools.exams", "issue");
      if (denied) return errorResponse(denied, 403);
      const termId = body.termId ?? (await getCurrentTerm(companyId))?.id;
      if (!termId) {
        return errorResponse("The school has no term running to invoice this against.", 400);
      }
      const result = await invoiceEntries({ companyId, actorId, seriesId, termId });
      return successResponse(result, 201);
    }

    const denied = schoolPermissionDenial(session, "schools.exams", "enter");
    if (denied) return errorResponse(denied, 403);

    if ("buildEntryFile" in body) {
      const built = await buildEntryFile({ companyId, actorId, seriesId });
      return successResponse(built, 201);
    }

    const entry = await enterSubject({
      companyId,
      actorId,
      seriesId,
      candidateId: body.candidateId,
      examSubjectId: body.examSubjectId,
    });
    return successResponse(entry, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof ExamError) return errorResponse(error.message, 422);
    console.error("[API] POST /api/v2/schools/exams/series/[id]/entries error:", error);
    return errorResponse("Failed to write the entry");
  }
}
