import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const updateInspectionSchema = z.object({
  inspectionDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  inspectorName: z.string().min(1).max(200).optional(),
  inspectorOrg: z.string().min(1).max(200).optional(),
  findings: z.string().min(1).max(5000).optional(),
  actions: z.string().max(5000).nullable().optional(),
  actionsDue: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).nullable().optional(),
  completedById: z.string().uuid().nullable().optional(),
  completedAt: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).nullable().optional(),
  documentUrl: z.string().url().max(2048).nullable().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

async function getInspectionForCompany(id: string, companyId: string) {
  const inspection = await prisma.inspection.findUnique({
    where: { id },
    include: {
      site: { select: { companyId: true, id: true, name: true, code: true } },
      completedBy: { select: { id: true, name: true } },
    },
  });
  if (!inspection || inspection.site.companyId !== companyId) return null;
  return inspection;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { id } = await params;
    const inspection = await getInspectionForCompany(id, session.user.companyId);
    if (!inspection) return errorResponse("Inspection not found", 404);
    return successResponse(inspection);
  } catch (error) {
    console.error("[API] GET /api/compliance/inspections/[id] error:", error);
    return errorResponse("Failed to fetch inspection");
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { id } = await params;
    const existing = await getInspectionForCompany(id, session.user.companyId);
    if (!existing) return errorResponse("Inspection not found", 404);

    const body = await request.json();
    const validated = updateInspectionSchema.parse(body);
    if (Object.keys(validated).length === 0) {
      return errorResponse("No fields provided", 400);
    }

    if (validated.completedById) {
      const user = await prisma.user.findUnique({
        where: { id: validated.completedById },
        select: { companyId: true },
      });
      if (!user || user.companyId !== session.user.companyId) {
        return errorResponse("Invalid completion user", 400);
      }
    }

    const inspection = await prisma.inspection.update({
      where: { id },
      data: {
        inspectionDate: validated.inspectionDate ? new Date(validated.inspectionDate) : undefined,
        inspectorName: validated.inspectorName,
        inspectorOrg: validated.inspectorOrg,
        findings: validated.findings,
        actions: validated.actions !== undefined ? validated.actions : undefined,
        actionsDue:
          validated.actionsDue !== undefined
            ? validated.actionsDue
              ? new Date(validated.actionsDue)
              : null
            : undefined,
        completedById:
          validated.completedById !== undefined ? validated.completedById : undefined,
        completedAt:
          validated.completedAt !== undefined
            ? validated.completedAt
              ? new Date(validated.completedAt)
              : null
            : undefined,
        documentUrl:
          validated.documentUrl !== undefined ? validated.documentUrl : undefined,
      },
      include: {
        site: { select: { id: true, name: true, code: true } },
        completedBy: { select: { id: true, name: true } },
      },
    });

    return successResponse(inspection);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/compliance/inspections/[id] error:", error);
    return errorResponse("Failed to update inspection");
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { id } = await params;
    const existing = await getInspectionForCompany(id, session.user.companyId);
    if (!existing) return errorResponse("Inspection not found", 404);

    await prisma.inspection.delete({ where: { id } });
    return successResponse({ success: true });
  } catch (error) {
    console.error("[API] DELETE /api/compliance/inspections/[id] error:", error);
    return errorResponse("Failed to delete inspection");
  }
}
