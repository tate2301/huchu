/**
 * Change or retire one client resource.
 *
 * There is no delete. A resource that has been offered on a document is part
 * of what that client was sent, and its link has to keep working; archiving
 * takes it off new documents and leaves the old ones alone.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { updateResourceSchema } from "@/lib/crm/resources";
import { requireCrmCapability } from "../../_helpers";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { id } = await params;

    if (!(await requireCrmCapability(session, "settings.manage"))) {
      return errorResponse("You cannot change the client resources", 403);
    }

    const existing = await prisma.crmResource.findFirst({
      where: { id, companyId },
      select: { id: true, kind: true, archivedAt: true },
    });
    if (!existing) return errorResponse("Resource not found", 404);

    const data = updateResourceSchema.parse(await request.json());
    if (data.url !== undefined && existing.kind !== "LINK") {
      return errorResponse("A file cannot be pointed somewhere else. Upload the new one instead.", 400);
    }
    const archivedAfter = data.archived ?? existing.archivedAt !== null;

    const resource = await prisma.crmResource.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description?.trim() || null } : {}),
        ...(data.url !== undefined ? { url: data.url } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        ...(data.archived !== undefined ? { archivedAt: data.archived ? new Date() : null } : {}),
        // A retired resource cannot be a default: it would be ticked on a new
        // quote and then refused when the quote was saved.
        ...(archivedAfter
          ? { isDefault: false }
          : data.isDefault !== undefined
            ? { isDefault: data.isDefault }
            : {}),
      },
    });

    return successResponse({ resource });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(error.issues[0]?.message ?? "Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/v2/crm/resources/[id] error:", error);
    return errorResponse("Failed to update the resource");
  }
}
