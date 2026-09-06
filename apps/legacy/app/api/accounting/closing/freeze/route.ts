import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { setFreezeBeforeDate } from "@/lib/accounting/closing";

const schema = z.object({
  freezeBeforeDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = schema.parse(body);

    const settings = await setFreezeBeforeDate({
      companyId: session.user.companyId,
      freezeBeforeDate: validated.freezeBeforeDate ? new Date(validated.freezeBeforeDate) : null,
    });

    return successResponse(settings);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/closing/freeze error:", error);
    return errorResponse("Failed to update freeze date");
  }
}

