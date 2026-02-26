import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator";

const schema = z.object({
  code: z.string().min(1).max(20).optional(),
  name: z.string().min(1).max(200),
  scope: z.enum(["CUSTOMER", "VENDOR", "BOTH"]).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const rows = await prisma.taxCategory.findMany({
      where: { companyId: session.user.companyId },
      orderBy: [{ code: "asc" }],
    });

    return successResponse(rows);
  } catch (error) {
    console.error("[API] GET /api/accounting/tax/categories error:", error);
    return errorResponse("Failed to fetch tax categories");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = schema.parse(body);

    const code = validated.code
      ? normalizeProvidedId(validated.code, "TAX_CATEGORY")
      : await reserveIdentifier(prisma, {
          companyId: session.user.companyId,
          entity: "TAX_CATEGORY",
        });

    const row = await prisma.taxCategory.create({
      data: {
        companyId: session.user.companyId,
        code,
        name: validated.name,
        scope: validated.scope ?? "BOTH",
        isActive: validated.isActive ?? true,
      },
    });

    return successResponse(row, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/tax/categories error:", error);
    return errorResponse("Failed to create tax category");
  }
}
