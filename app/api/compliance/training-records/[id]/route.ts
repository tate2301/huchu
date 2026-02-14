import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const updateTrainingSchema = z.object({
  userId: z.string().uuid().optional(),
  trainingType: z.string().min(1).max(200).optional(),
  trainingDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  expiryDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).nullable().optional(),
  certificateUrl: z.string().url().max(2048).nullable().optional(),
  trainedBy: z.string().max(200).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

async function getTrainingForCompany(id: string, companyId: string) {
  const record = await prisma.trainingRecord.findUnique({
    where: { id },
    include: {
      user: { select: { companyId: true, id: true, name: true, email: true } },
    },
  });
  if (!record || record.user.companyId !== companyId) return null;
  return record;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const record = await getTrainingForCompany(id, session.user.companyId);
    if (!record) return errorResponse("Training record not found", 404);
    return successResponse(record);
  } catch (error) {
    console.error("[API] GET /api/compliance/training-records/[id] error:", error);
    return errorResponse("Failed to fetch training record");
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const existing = await getTrainingForCompany(id, session.user.companyId);
    if (!existing) return errorResponse("Training record not found", 404);

    const body = await request.json();
    const validated = updateTrainingSchema.parse(body);
    if (Object.keys(validated).length === 0) {
      return errorResponse("No fields provided", 400);
    }

    if (validated.userId) {
      const user = await prisma.user.findUnique({
        where: { id: validated.userId },
        select: { companyId: true },
      });
      if (!user || user.companyId !== session.user.companyId) {
        return errorResponse("Invalid user", 400);
      }
    }

    const record = await prisma.trainingRecord.update({
      where: { id },
      data: {
        userId: validated.userId,
        trainingType: validated.trainingType,
        trainingDate: validated.trainingDate ? new Date(validated.trainingDate) : undefined,
        expiryDate:
          validated.expiryDate !== undefined
            ? validated.expiryDate
              ? new Date(validated.expiryDate)
              : null
            : undefined,
        certificateUrl:
          validated.certificateUrl !== undefined ? validated.certificateUrl : undefined,
        trainedBy: validated.trainedBy !== undefined ? validated.trainedBy : undefined,
        notes: validated.notes !== undefined ? validated.notes : undefined,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return successResponse(record);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/compliance/training-records/[id] error:", error);
    return errorResponse("Failed to update training record");
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const existing = await getTrainingForCompany(id, session.user.companyId);
    if (!existing) return errorResponse("Training record not found", 404);

    await prisma.trainingRecord.delete({ where: { id } });
    return successResponse({ success: true });
  } catch (error) {
    console.error("[API] DELETE /api/compliance/training-records/[id] error:", error);
    return errorResponse("Failed to delete training record");
  }
}
