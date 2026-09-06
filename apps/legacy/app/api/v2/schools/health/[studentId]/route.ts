import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import {
  HealthRecordError,
  clearHealthRecord,
  recordHealthEvent,
  saveHealthRecord,
} from "@/lib/schools/health";

const text = (max: number) => z.string().trim().max(max).nullish();

const saveSchema = z.object({
  bloodGroup: text(10),
  allergies: text(1000),
  chronicConditions: text(1000),
  medications: text(1000),
  dietaryRequirements: text(500),
  doctorName: text(160),
  doctorPhone: text(40),
  medicalAidProvider: text(160),
  medicalAidNumber: text(60),
  consentFirstAid: z.boolean().optional(),
  consentEmergencyTreatment: z.boolean().optional(),
  consentPhotography: z.boolean().optional(),
  consentOutings: z.boolean().optional(),
  consentGivenBy: text(160),
  notes: text(2000),
});

const eventSchema = z.object({
  kind: z.enum(["SANATORIUM_VISIT", "MEDICATION", "INJURY", "REFERRAL", "SCREENING"]),
  summary: z.string().trim().min(1).max(500),
  treatment: text(1000),
  guardianNotified: z.boolean().optional(),
  occurredAt: z.string().datetime().optional(),
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ studentId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.boarding", "view");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { studentId } = await context.params;
    const student = await prisma.schoolStudent.findFirst({
      where: { id: studentId, companyId },
      select: {
        id: true,
        studentNo: true,
        firstName: true,
        lastName: true,
        isBoarding: true,
        healthRecord: true,
      },
    });
    if (!student) return errorResponse("Student not found", 404);

    const events = await prisma.schoolHealthEvent.findMany({
      where: { companyId, studentId },
      // Newest first: the question is almost always "what happened recently".
      orderBy: { occurredAt: "desc" },
      take: 100,
    });

    return successResponse({ student, record: student.healthRecord, events });
  } catch (error) {
    console.error("[API] GET /api/v2/schools/health/[studentId] error:", error);
    return errorResponse("Failed to fetch the health record");
  }
}

/** Create or update the standing record. */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ studentId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.boarding", "edit");
    if (denied) return errorResponse(denied, 403);

    const { studentId } = await context.params;
    const validated = saveSchema.parse(await request.json());

    const saved = await saveHealthRecord({
      companyId: session.user.companyId,
      studentId,
      values: validated,
      updatedById: session.user.id,
    });
    return successResponse(saved);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof HealthRecordError) return errorResponse(error.message, 400);
    console.error("[API] PUT /api/v2/schools/health/[studentId] error:", error);
    return errorResponse("Failed to save the health record");
  }
}

/** Record a visit, a dose or an injury. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ studentId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.boarding", "edit");
    if (denied) return errorResponse(denied, 403);

    const { studentId } = await context.params;
    const validated = eventSchema.parse(await request.json());

    const event = await recordHealthEvent({
      companyId: session.user.companyId,
      studentId,
      kind: validated.kind,
      summary: validated.summary,
      treatment: validated.treatment ?? null,
      guardianNotified: validated.guardianNotified,
      occurredAt: validated.occurredAt ? new Date(validated.occurredAt) : undefined,
      recordedById: session.user.id,
    });
    return successResponse(event, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof HealthRecordError) return errorResponse(error.message, 404);
    console.error("[API] POST /api/v2/schools/health/[studentId] error:", error);
    return errorResponse("Failed to record the health event");
  }
}

/**
 * Clear the standing record.
 *
 * `archive` rather than `edit`: losing a child's allergies and consents is not
 * the same act as correcting them, and the people trusted with the second are
 * not automatically trusted with the first.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ studentId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.boarding", "archive");
    if (denied) return errorResponse(denied, 403);

    const { studentId } = await context.params;
    const cleared = await clearHealthRecord({
      companyId: session.user.companyId,
      studentId,
    });
    return successResponse(cleared);
  } catch (error) {
    if (error instanceof HealthRecordError) return errorResponse(error.message, 409);
    console.error("[API] DELETE /api/v2/schools/health/[studentId] error:", error);
    return errorResponse("Failed to clear the health record");
  }
}
