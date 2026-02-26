import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).nullable().optional(),
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
    .optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const existing = await prisma.taxTemplate.findUnique({ where: { id }, select: { companyId: true } });
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Tax template not found", 404);
    }

    const body = await request.json();
    const validated = schema.parse(body);

    const updated = await prisma.$transaction(async (tx) => {
      if (validated.lines) {
        await tx.taxTemplateLine.deleteMany({ where: { templateId: id } });
      }

      return tx.taxTemplate.update({
        where: { id },
        data: {
          name: validated.name,
          description: validated.description === undefined ? undefined : validated.description,
          isActive: validated.isActive,
          ...(validated.lines
            ? {
                lines: {
                  create: validated.lines.map((line, index) => ({
                    taxCodeId: line.taxCodeId,
                    sortOrder: line.sortOrder ?? index,
                    appliesTo: line.appliesTo ?? "BOTH",
                    isDefault: line.isDefault ?? index === 0,
                  })),
                },
              }
            : {}),
        },
        include: {
          lines: {
            include: { taxCode: true },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          },
        },
      });
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/accounting/tax/templates/[id] error:", error);
    return errorResponse("Failed to update tax template");
  }
}
