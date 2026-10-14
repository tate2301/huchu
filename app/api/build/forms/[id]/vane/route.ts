import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { proposalOf, type FormProposal } from "@/lib/build/form-changes";
import { prisma } from "@/lib/prisma";

/**
 * Vane's changes to one site-visit form, from its answers (PageVaneForm):
 * those waiting, and those kept in the last fortnight. Read only: keeping one
 * is the person's (Publish in Build, or approving it), not Vane's.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { companyId } = sessionResult.session.user;
    const { id } = await params;
    const since = new Date(Date.now() - 14 * 86_400_000);
    const rows = await prisma.vaneAction.findMany({
      where: {
        companyId,
        kind: "build.form.change",
        params: { path: ["setId"], equals: id },
        OR: [{ status: { in: ["PROPOSED", "FAILED"] } }, { status: "DONE", doneAt: { gte: since } }],
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, status: true, params: true, result: true },
    });
    const proposals = rows.map(proposalOf).filter((row): row is FormProposal => row !== null);
    return successResponse({ proposals });
  } catch (error) {
    console.error("[API] GET /api/build/forms/[id]/vane error:", error);
    return errorResponse("Could not read Vane's changes");
  }
}
