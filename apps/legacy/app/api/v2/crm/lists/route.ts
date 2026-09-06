import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { VIEW_ENTITY_KEYS } from "@/lib/crm/views-registry";

const createListSchema = z.object({
  entity: z.enum(VIEW_ENTITY_KEYS),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  isShared: z.boolean().optional(),
  /** Seed the list with a selection made in the table. */
  recordIds: z.array(z.string().uuid()).max(500).optional(),
});

/**
 * Static lists — records someone put there by hand, as opposed to a saved
 * view's "whatever matches these filters". Keeping the two distinct is the
 * point: a campaign list shouldn't quietly change under you.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const requested = searchParams.get("entity");
    const entity = VIEW_ENTITY_KEYS.find((value) => value === requested);

    const lists = await prisma.crmList.findMany({
      where: {
        companyId: session.user.companyId,
        ...(entity ? { entity } : {}),
        OR: [{ isShared: true }, { createdById: session.user.id }],
      },
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { members: true } },
      },
      orderBy: [{ isShared: "desc" }, { name: "asc" }],
    });

    return successResponse({ data: lists });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/lists error:", error);
    return errorResponse("Failed to fetch lists");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const data = createListSchema.parse(await request.json());

    const clash = await prisma.crmList.findFirst({
      where: { companyId, entity: data.entity, name: data.name },
      select: { id: true },
    });
    if (clash) return errorResponse("A list with that name already exists here", 409);

    const list = await prisma.crmList.create({
      data: {
        companyId,
        entity: data.entity,
        name: data.name,
        description: data.description ?? undefined,
        isShared: data.isShared ?? false,
        createdById: session.user.id,
        ...(data.recordIds && data.recordIds.length > 0
          ? {
              members: {
                create: data.recordIds.map((recordId) => ({
                  companyId,
                  recordId,
                  addedById: session.user.id,
                })),
              },
            }
          : {}),
      },
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { members: true } },
      },
    });

    return successResponse(list, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/lists error:", error);
    return errorResponse("Failed to create the list");
  }
}
