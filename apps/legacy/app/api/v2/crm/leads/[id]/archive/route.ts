import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { canEditRecord } from "@corelithzw/module-crm/permissions";

/**
 * Put a lead away, or take it back out.
 *
 * A lead had no ending short of dragging it to Lost, which is a claim about
 * the business — somebody looked at it and said no — and a duplicate, a test
 * row or a wrong number is not that. Archiving is the ending for those: the
 * record survives, so the enquiry still counts in "where did our leads come
 * from", but it leaves every list, board and total.
 *
 * Reversible on purpose, and by the same permission that archived it. The
 * irreversible option is DELETE on the lead itself, which is a different
 * capability.
 */
const bodySchema = z.object({
  archived: z.boolean(),
  /** Why it was put away — kept on the record's own trail. */
  reason: z.string().trim().max(500).optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { id } = await params;

    const existing = await prisma.crmLead.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        leadNo: true,
        assignedToId: true,
        archivedAt: true,
        convertedAt: true,
        convertedDealId: true,
      },
    });
    if (!existing) return errorResponse("Lead not found", 404);
    if (!(await canEditRecord(session, existing.assignedToId))) {
      return errorResponse("You can only archive leads assigned to you", 403);
    }

    const { archived, reason } = bodySchema.parse(await request.json());

    // Restoring a converted lead would put the deal's own origin back into the
    // pipeline beside it — the exact double-count archiving on conversion
    // exists to prevent.
    if (!archived && existing.convertedAt) {
      return errorResponse(
        "This lead became a deal. Its deal is where the work is now, so it stays archived.",
        409,
      );
    }

    if (Boolean(existing.archivedAt) === archived) {
      return successResponse({ id, archived });
    }

    const now = new Date();
    const [updated] = await prisma.$transaction([
      prisma.crmLead.update({
        where: { id },
        data: archived
          ? { archivedAt: now, archivedById: session.user.id }
          : { archivedAt: null, archivedById: null },
      }),
      prisma.crmActivity.create({
        data: {
          companyId,
          type: "SYSTEM",
          leadId: id,
          subject: archived
            ? `Lead ${existing.leadNo} archived`
            : `Lead ${existing.leadNo} restored`,
          body: reason || null,
          occurredAt: now,
          createdById: session.user.id,
        },
      }),
    ]);

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/leads/[id]/archive error:", error);
    return errorResponse("Failed to archive lead");
  }
}
