import { NextRequest, NextResponse } from "next/server";
import { RetailPromotionStatus } from "@corelithzw/db";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-response";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import { prisma } from "@corelithzw/db/client";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: z.enum(["PERCENT", "AMOUNT", "BUY_X_GET_Y", "BUNDLE"]).optional(),
  value: z.number().min(0).optional(),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  status: z.nativeEnum(RetailPromotionStatus).optional(),
  notes: z.string().max(500).optional().nullable(),
});

async function getPromotion(companyId: string, id: string) {
  return prisma.retailPromotion.findFirst({
    where: { id, companyId },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const gate = requireRetailPermission(session, "retail.catalog", "update");
  if (gate) return gate;

  try {
    /*
    R-3.1. The segment, through a schema.

    Prisma is not injectable, so this is not a security fix. It is the
    difference between a 400 naming the parameter and a 404 that reads, to a
    shopkeeper, as "the receipt you are holding is not in the system".
  */
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const { id } = path.data;
    const existing = await getPromotion(session.user.companyId, id);
    if (!existing) {
      return errorResponse("Promotion not found", 404);
    }

    const body = await request.json();
    const input = patchSchema.parse(body);

    const updated = await prisma.retailPromotion.update({
      where: { id: existing.id },
      data: {
        name: input.name?.trim(),
        type: input.type,
        value: input.value,
        startsAt: input.startsAt ? new Date(input.startsAt) : input.startsAt,
        endsAt: input.endsAt ? new Date(input.endsAt) : input.endsAt,
        status: input.status,
        notes: input.notes?.trim() ?? input.notes,
      },
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/v2/retail/promotions/[id] error:", error);
    return errorResponse("Failed to update promotion");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const gate = requireRetailPermission(session, "retail.catalog", "delete");
  if (gate) return gate;

  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const { id } = path.data;
  const existing = await getPromotion(session.user.companyId, id);
  if (!existing) {
    return errorResponse("Promotion not found", 404);
  }

  await prisma.retailPromotion.delete({ where: { id: existing.id } });
  return successResponse({ success: true });
}
