/**
 * The tenant's library of client resources.
 *
 * Reading is open to anybody in the CRM — the document builder lists the
 * library for whoever is raising a quote. Adding is open to the settings
 * screen and to anybody who can issue documents, because the builder can
 * upload a file on the spot and that file joins the library. Changing or
 * retiring an entry is a settings change; see `[id]/route.ts`.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { createResourceSchema, sortResources } from "@/lib/crm/resources";
import { requireCrmCapability } from "../_helpers";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    // Archived entries only for the settings screen, which is where they are
    // restored from. The builder never offers one.
    const withArchived = new URL(request.url).searchParams.get("archived") === "1";

    const resources = await prisma.crmResource.findMany({
      where: { companyId, ...(withArchived ? {} : { archivedAt: null }) },
      select: {
        id: true,
        title: true,
        description: true,
        kind: true,
        url: true,
        contentType: true,
        isDefault: true,
        archivedAt: true,
        sortOrder: true,
        _count: { select: { documents: true } },
      },
    });

    return successResponse({
      data: sortResources(resources).map(({ _count, ...resource }) => ({
        ...resource,
        /** How many documents have offered it — what archiving would affect. */
        documentCount: _count.documents,
      })),
      canEdit: await requireCrmCapability(session, "settings.manage"),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/resources error:", error);
    return errorResponse("Failed to load the client resources");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const [manages, issues] = await Promise.all([
      requireCrmCapability(session, "settings.manage"),
      requireCrmCapability(session, "documents.issue"),
    ]);
    if (!manages && !issues) {
      return errorResponse("You cannot add to the client resources", 403);
    }

    const data = createResourceSchema.parse(await request.json());

    // New entries go to the end of the list rather than jumping the queue.
    const last = await prisma.crmResource.aggregate({
      where: { companyId },
      _max: { sortOrder: true },
    });

    const resource = await prisma.crmResource.create({
      data: {
        companyId,
        kind: data.kind,
        title: data.title,
        description: data.description?.trim() || null,
        url: data.url,
        pathname: data.kind === "FILE" ? data.pathname : null,
        contentType: data.kind === "FILE" ? data.contentType : null,
        // Only the settings screen decides what goes with every document; a
        // file uploaded from the builder is for the document in hand.
        isDefault: manages ? (data.isDefault ?? false) : false,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
      },
    });

    return successResponse({ resource }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(error.issues[0]?.message ?? "Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/crm/resources error:", error);
    return errorResponse("Failed to add the resource");
  }
}
