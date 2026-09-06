import { NextRequest, NextResponse } from "next/server";
import { Prisma, RetailPromotionStatus, RetailPromotionType } from "@corelithzw/db";
import { z } from "zod";
import { errorResponse, successResponse } from "@corelithzw/platform/api-response";
import { normalizeProvidedId, reserveIdentifier } from "@corelithzw/platform/id-generator";
import { prisma } from "@corelithzw/db/client";
import { requireRetailPermission } from "@corelithzw/module-sell/permissions";
import { requireRetailSession } from "../_helpers";

const promotionSchema = z.object({
  promoCode: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(200),
  type: z.enum(["PERCENT", "AMOUNT", "BUY_X_GET_Y", "BUNDLE"]),
  value: z.number().min(0),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  status: z.nativeEnum(RetailPromotionStatus).optional(),
  notes: z.string().max(500).optional().nullable(),
});

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  // R-2.3. A promotion is a price, so it is the shelf's question, not its own.
  // The till has to know what is on offer before it can apply one.
  const gate = requireRetailPermission(session, "retail.catalog", "view");
  if (gate) return gate;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim();
  const status = searchParams.get("status")?.trim();
  const includeUnsupported = searchParams.get("includeUnsupported") === "true";
  const posOnly =
    searchParams.get("pos") === "1" || (status === "ACTIVE" && !includeUnsupported);

  const where: Prisma.RetailPromotionWhereInput = { companyId: session.user.companyId };
  if (status && status !== "all") {
    const parsed = RetailPromotionStatus[status as keyof typeof RetailPromotionStatus];
    if (!parsed) return errorResponse(`Unknown status "${status}"`, 400);
    where.status = parsed;
  }
  if (posOnly) {
    where.type = { in: [RetailPromotionType.PERCENT, RetailPromotionType.AMOUNT] };
  }
  if (search) {
    // `type` is an enum now, and Postgres has no `LIKE` for one. Searching it means
    // resolving the text to the labels it matches first and filtering on those; a
    // search matching no label simply drops the clause rather than matching every
    // row, which is what a `contains` against an unmatched string used to do.
    const matchingTypes = Object.values(RetailPromotionType).filter((value) =>
      value.toLowerCase().includes(search.toLowerCase()),
    );
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { promoCode: { contains: search, mode: "insensitive" } },
      ...(matchingTypes.length > 0 ? [{ type: { in: matchingTypes } }] : []),
    ];
  }

  const promotions = await prisma.retailPromotion.findMany({
    where,
    orderBy: [{ status: "asc" }, { startsAt: "desc" }, { name: "asc" }],
  });

  return successResponse({ data: promotions });
}

export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const gate = requireRetailPermission(session, "retail.catalog", "create");
  if (gate) return gate;

  try {
    const body = await request.json();
    const input = promotionSchema.parse(body);
    const providedCode = input.promoCode
      ? normalizeProvidedId(input.promoCode, "RETAIL_PROMOTION")
      : null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const promoCode =
        providedCode ??
        (await reserveIdentifier(prisma, {
          companyId: session.user.companyId,
          entity: "RETAIL_PROMOTION",
        }));

      try {
        const promotion = await prisma.retailPromotion.create({
          data: {
            companyId: session.user.companyId,
            promoCode,
            name: input.name.trim(),
            type: input.type,
            value: input.value,
            startsAt: input.startsAt ? new Date(input.startsAt) : null,
            endsAt: input.endsAt ? new Date(input.endsAt) : null,
            status: input.status ?? RetailPromotionStatus.ACTIVE,
            notes: input.notes?.trim() || null,
          },
        });

        return successResponse(promotion, 201);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          if (providedCode) {
            return errorResponse("Promotion code already exists", 409);
          }
          continue;
        }
        throw error;
      }
    }

    return errorResponse("Unable to generate promotion code", 409);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/retail/promotions error:", error);
    return errorResponse("Failed to create promotion");
  }
}
