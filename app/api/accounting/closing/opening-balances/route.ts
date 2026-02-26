import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { importOpeningBalances } from "@/lib/accounting/closing";

const schema = z.object({
  effectiveDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  sourceReference: z.string().max(120).optional(),
  notes: z.string().max(2000).optional(),
  lines: z
    .array(
      z.object({
        accountId: z.string().uuid(),
        debit: z.number().min(0).optional(),
        credit: z.number().min(0).optional(),
        memo: z.string().max(500).optional(),
        costCenterId: z.string().uuid().optional(),
      }),
    )
    .min(2),
});

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = schema.parse(body);

    const result = await importOpeningBalances({
      companyId: session.user.companyId,
      effectiveDate: new Date(validated.effectiveDate),
      createdById: session.user.id,
      sourceReference: validated.sourceReference,
      notes: validated.notes,
      lines: validated.lines,
    });

    return successResponse(result, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/closing/opening-balances error:", error);
    return errorResponse(error instanceof Error ? error.message : "Failed to import opening balances");
  }
}

