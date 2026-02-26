import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator";

const taxSchema = z.object({
  code: z.string().min(1).max(20).optional(),
  name: z.string().min(1).max(200),
  rate: z.number().min(0).max(100),
  type: z.string().max(50).optional(),
  appliesTo: z.enum(["SALES", "PURCHASE", "BOTH"]).optional(),
  vat7OutputBox: z.string().max(120).optional(),
  vat7InputBox: z.string().max(120).optional(),
  scheduleType: z.enum(["NONE", "FX", "RTGS", "WITHHOLDING"]).optional(),
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const taxCodes = await prisma.taxCode.findMany({
      where: { companyId: session.user.companyId },
      orderBy: [{ code: "asc" }],
    });

    return successResponse(taxCodes);
  } catch (error) {
    console.error("[API] GET /api/accounting/tax error:", error);
    return errorResponse("Failed to fetch tax codes");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = taxSchema.parse(body);
    const code = validated.code
      ? normalizeProvidedId(validated.code, "TAX_CODE")
      : await reserveIdentifier(prisma, {
          companyId: session.user.companyId,
          entity: "TAX_CODE",
        });

    const taxCode = await prisma.taxCode.create({
      data: {
        companyId: session.user.companyId,
        code,
        name: validated.name,
        rate: validated.rate,
        type: validated.type ?? "VAT",
        appliesTo: validated.appliesTo ?? "BOTH",
        vat7OutputBox: validated.vat7OutputBox,
        vat7InputBox: validated.vat7InputBox,
        scheduleType: validated.scheduleType ?? "NONE",
        effectiveFrom: validated.effectiveFrom ? new Date(validated.effectiveFrom) : undefined,
        effectiveTo: validated.effectiveTo ? new Date(validated.effectiveTo) : undefined,
        isActive: validated.isActive ?? true,
      },
    });

    return successResponse(taxCode, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/tax error:", error);
    return errorResponse("Failed to create tax code");
  }
}
