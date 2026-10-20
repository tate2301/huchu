import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { guardBooks } from "@/lib/books/core";

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  isActive: z.boolean().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    // The chart, cost centres and posting rules: the owner or the accountant (books-final §2.2).
    const { refused: notAllowed } = await guardBooks(sessionResult.session, "setup");
    if (notAllowed) return notAllowed;
    const { session } = sessionResult;
    const { id } = await params;

    const body = await request.json();
    const validated = updateSchema.parse(body);

    const existing = await prisma.costCenter.findUnique({
      where: { id },
      select: { companyId: true },
    });
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Cost center not found", 404);
    }

    const updated = await prisma.costCenter.update({
      where: { id },
      data: validated,
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/accounting/cost-centers/[id] error:", error);
    return errorResponse("Failed to update cost center");
  }
}
