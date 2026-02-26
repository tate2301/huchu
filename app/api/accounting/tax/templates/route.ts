import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator";

const schema = z.object({
  code: z.string().min(1).max(20).optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
  lines: z
    .array(
      z.object({
        taxCodeId: z.string().uuid(),
        sortOrder: z.number().int().min(0).optional(),
        appliesTo: z.enum(["SALES", "PURCHASE", "BOTH"]).optional(),
        isDefault: z.boolean().optional(),
      }),
    )
    .min(1),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const rows = await prisma.taxTemplate.findMany({
      where: { companyId: session.user.companyId },
      include: {
        lines: {
          include: { taxCode: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
      },
      orderBy: [{ code: "asc" }],
    });

    return successResponse(rows);
  } catch (error) {
    console.error("[API] GET /api/accounting/tax/templates error:", error);
    return errorResponse("Failed to fetch tax templates");
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
      ? normalizeProvidedId(validated.code, "TAX_TEMPLATE")
      : await reserveIdentifier(prisma, {
          companyId: session.user.companyId,
          entity: "TAX_TEMPLATE",
        });

    const row = await prisma.taxTemplate.create({
      data: {
        companyId: session.user.companyId,
        code,
        name: validated.name,
        description: validated.description,
        isActive: validated.isActive ?? true,
        lines: {
          create: validated.lines.map((line, index) => ({
            taxCodeId: line.taxCodeId,
            sortOrder: line.sortOrder ?? index,
            appliesTo: line.appliesTo ?? "BOTH",
            isDefault: line.isDefault ?? index === 0,
          })),
        },
      },
      include: {
        lines: {
          include: { taxCode: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    return successResponse(row, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/tax/templates error:", error);
    return errorResponse("Failed to create tax template");
  }
}
