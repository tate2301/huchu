import { NextRequest, NextResponse } from "next/server";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const entry = await prisma.journalEntry.findUnique({
      where: { id },
      include: { lines: true },
    });

    if (!entry || entry.companyId !== session.user.companyId) {
      return errorResponse("Journal entry not found", 404);
    }
    if (entry.status === "POSTED") {
      return errorResponse("Journal entry already posted", 400);
    }

    const updated = await prisma.journalEntry.update({
      where: { id },
      data: {
        status: "POSTED",
        postedAt: new Date(),
        postedById: session.user.id,
      },
      include: { lines: true },
    });

    return successResponse(updated);
  } catch (error) {
    console.error("[API] POST /api/accounting/journals/[id]/post error:", error);
    return errorResponse("Failed to post journal entry");
  }
}
