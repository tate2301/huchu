import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { guardBooks } from "@/lib/books/core";
import { prisma } from "@/lib/prisma";

/**
 * Only a month's end date changes here. Closing and reopening go through the
 * voucher routes (`closing/period-close`, `closing/period-reopen`), which run
 * the checks and keep the voucher; reopening is the owner's (books-final §4.15).
 */
const updateSchema = z
  .object({
    endDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
    status: z.unknown().optional(),
  })
  .refine((body) => body.status === undefined, {
    message: "Close a month from Periods, and reopen it there with a reason. Its status is not changed here.",
    path: ["status"],
  });

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const period = await prisma.accountingPeriod.findUnique({
      where: { id },
    });

    if (!period || period.companyId !== session.user.companyId) {
      return errorResponse("Accounting period not found", 404);
    }

    return successResponse(period);
  } catch (error) {
    console.error("[API] GET /api/accounting/periods/[id] error:", error);
    return errorResponse("Failed to fetch accounting period");
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const body = await request.json();
    const validated = updateSchema.parse(body);
    const { refused } = await guardBooks(session, "period.close", { kind: "period" });
    if (refused) return refused;

    const existing = await prisma.accountingPeriod.findUnique({
      where: { id },
      select: { companyId: true, status: true },
    });

    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Accounting period not found", 404);
    }

    if (existing.status === "CLOSED") return errorResponse("This month is closed. Reopen it first to change its dates.", 409);
    const update: Record<string, unknown> = {};
    if (validated.endDate) update.endDate = new Date(validated.endDate);

    const period = await prisma.accountingPeriod.update({
      where: { id },
      data: update,
    });

    return successResponse(period);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/accounting/periods/[id] error:", error);
    return errorResponse("Failed to update accounting period");
  }
}
