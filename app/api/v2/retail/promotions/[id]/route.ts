import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { requireRetailManager, requireRetailSession } from "../../_helpers";

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: z.enum(["PERCENT", "AMOUNT", "BUY_X_GET_Y", "BUNDLE"]).optional(),
  value: z.number().min(0).optional(),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  status: z.string().min(1).max(40).optional(),
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

  const gate = requireRetailManager(session);
  if (gate) return gate;

  try {
    const { id } = await params;
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
        status: input.status?.trim(),
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

  const gate = requireRetailManager(session);
  if (gate) return gate;

  const { id } = await params;
  const existing = await getPromotion(session.user.companyId, id);
  if (!existing) {
    return errorResponse("Promotion not found", 404);
  }

  await prisma.retailPromotion.delete({ where: { id: existing.id } });
  return successResponse({ success: true });
}
