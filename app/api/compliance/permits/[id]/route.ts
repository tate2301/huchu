import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const updatePermitSchema = z.object({
  permitType: z.string().min(1).max(200).optional(),
  permitNumber: z.string().min(1).max(200).optional(),
  issueDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  expiryDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  responsiblePerson: z.string().min(1).max(200).optional(),
  documentUrl: z.string().url().max(2048).nullable().optional(),
  status: z.string().max(50).optional(),
});

type RouteParams = { params: { id: string } };

const permitStatusFromDate = (expiryDate: Date) => {
  const now = new Date();
  if (expiryDate.getTime() < now.getTime()) return "EXPIRED";
  const soon = new Date(now);
  soon.setDate(soon.getDate() + 30);
  if (expiryDate.getTime() <= soon.getTime()) return "EXPIRING_SOON";
  return "ACTIVE";
};

async function getPermitForCompany(id: string, companyId: string) {
  const permit = await prisma.permit.findUnique({
    where: { id },
    include: {
      site: { select: { companyId: true, id: true, name: true, code: true } },
    },
  });
  if (!permit || permit.site.companyId !== companyId) return null;
  return permit;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const permit = await getPermitForCompany(params.id, session.user.companyId);
    if (!permit) return errorResponse("Permit not found", 404);
    return successResponse(permit);
  } catch (error) {
    console.error("[API] GET /api/compliance/permits/[id] error:", error);
    return errorResponse("Failed to fetch permit");
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const existing = await getPermitForCompany(params.id, session.user.companyId);
    if (!existing) return errorResponse("Permit not found", 404);

    const body = await request.json();
    const validated = updatePermitSchema.parse(body);
    if (Object.keys(validated).length === 0) {
      return errorResponse("No fields provided", 400);
    }

    const expiryDate =
      validated.expiryDate !== undefined ? new Date(validated.expiryDate) : existing.expiryDate;

    const updated = await prisma.permit.update({
      where: { id: params.id },
      data: {
        permitType: validated.permitType,
        permitNumber: validated.permitNumber,
        issueDate: validated.issueDate ? new Date(validated.issueDate) : undefined,
        expiryDate: validated.expiryDate ? new Date(validated.expiryDate) : undefined,
        responsiblePerson: validated.responsiblePerson,
        documentUrl: validated.documentUrl !== undefined ? validated.documentUrl : undefined,
        status: validated.status ?? permitStatusFromDate(expiryDate),
      },
      include: {
        site: { select: { id: true, name: true, code: true } },
      },
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/compliance/permits/[id] error:", error);
    return errorResponse("Failed to update permit");
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const existing = await getPermitForCompany(params.id, session.user.companyId);
    if (!existing) return errorResponse("Permit not found", 404);

    await prisma.permit.delete({ where: { id: params.id } });
    return successResponse({ success: true });
  } catch (error) {
    console.error("[API] DELETE /api/compliance/permits/[id] error:", error);
    return errorResponse("Failed to delete permit");
  }
}
