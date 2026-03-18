import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";
import { requireRetailSession } from "../../_helpers";

const heldCartSchema = z.object({
  holdNo: z.string().min(1).max(50).optional(),
  shiftId: z.string().uuid(),
  label: z.string().max(120).optional().nullable(),
  cartSnapshot: z.record(z.string(), z.unknown()),
});

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const { searchParams } = new URL(request.url);
  const shiftId = searchParams.get("shiftId")?.trim();

  const where: Prisma.RetailHeldCartWhereInput = {
    companyId: session.user.companyId,
    status: { in: ["HELD", "RECALLED"] },
  };
  if (shiftId) where.shiftId = shiftId;

  const carts = await prisma.retailHeldCart.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return successResponse({ data: carts });
}

export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  try {
    const body = await request.json();
    const input = heldCartSchema.parse(body);

    const shift = await prisma.retailShift.findFirst({
      where: {
        id: input.shiftId,
        companyId: session.user.companyId,
        status: "OPEN",
      },
    });
    if (!shift) {
      return errorResponse("Open shift not found", 404);
    }

    const providedCode = input.holdNo
      ? normalizeProvidedId(input.holdNo, "RETAIL_HELD_CART")
      : null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const holdNo =
        providedCode ??
        (await reserveIdentifier(prisma, {
          companyId: session.user.companyId,
          entity: "RETAIL_HELD_CART",
          siteId: shift.siteId,
        }));

      try {
        const cart = await prisma.retailHeldCart.create({
          data: {
            companyId: session.user.companyId,
            holdNo,
            shiftId: shift.id,
            cashierId: session.user.id,
            label: input.label?.trim() || null,
            cartSnapshot: input.cartSnapshot as Prisma.InputJsonValue,
            status: "HELD",
          },
        });

        return successResponse(cart, 201);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          if (providedCode) {
            return errorResponse("Held cart number already exists", 409);
          }
          continue;
        }
        throw error;
      }
    }

    return errorResponse("Unable to generate held cart number", 409);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/retail/pos/held-carts error:", error);
    return errorResponse("Failed to hold cart");
  }
}
