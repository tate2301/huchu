import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import {
  BoardingSessionError,
  heldBeds,
  resolveTermId,
  sickBayInclude,
} from "@/lib/schools/boarding-sessions";

const listQuerySchema = z.object({
  termId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  /** Set to include discharges. Defaults to who is in there right now. */
  includeDischarged: z.enum(["true", "false"]).optional(),
});

const admitSchema = z.object({
  studentId: z.string().uuid(),
  termId: z.string().uuid().optional(),
  bedId: z.string().uuid().nullable().optional(),
  admittedAt: z
    .string()
    .trim()
    .min(1)
    .refine((value) => !Number.isNaN(new Date(value).getTime()), {
      message: "Invalid date value",
    })
    .optional(),
  reason: z.string().trim().min(1).max(500),
  notes: z.string().trim().min(1).max(2000).nullable().optional(),
});

/**
 * Who is in the sick bay.
 *
 * Each row carries the bed still being held for them back in their house,
 * because "where does this child go when they are discharged" is the next
 * question after "who is in here", and the matron should not have to go and
 * look it up on another screen.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.boarding", "view");
    if (denied) return errorResponse(denied, 403);

    const companyId = session.user.companyId;
    const { searchParams } = new URL(request.url);
    const query = listQuerySchema.parse({
      termId: searchParams.get("termId") ?? undefined,
      studentId: searchParams.get("studentId") ?? undefined,
      includeDischarged: searchParams.get("includeDischarged") ?? undefined,
    });

    const admissions = await prisma.schoolSickBayAdmission.findMany({
      where: {
        companyId,
        ...(query.termId ? { termId: query.termId } : {}),
        ...(query.studentId ? { studentId: query.studentId } : {}),
        ...(query.includeDischarged === "true" ? {} : { dischargedAt: null }),
      },
      include: sickBayInclude,
      orderBy: [{ admittedAt: "desc" }],
      take: 200,
    });

    const held = await heldBeds(
      companyId,
      admissions.map((admission) => admission.studentId),
    );

    return successResponse(
      admissions.map((admission) => ({
        ...admission,
        // Their own bed, still theirs. Read-only here by design.
        heldBed: held.get(admission.studentId) ?? null,
      })),
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof BoardingSessionError) {
      return errorResponse(error.message, error.status);
    }
    console.error("[API] GET /api/v2/schools/boarding/sick-bay error:", error);
    return errorResponse("Failed to fetch sick bay admissions");
  }
}

/**
 * Admit a boarder to the sick bay.
 *
 * ## What this deliberately does not do
 *
 * It does not touch the pupil's `SchoolBoardingAllocation`. Not as an
 * oversight — as the entire point. Modelling the sick bay as another house and
 * moving the child into it would end their allocation and free their bed, and
 * the placer would hand it to somebody else while its owner is two doors away
 * with a temperature. An admission is a second, lighter record that says "not
 * in their bed tonight, and the bed is not available".
 *
 * There is a witness test asserting the allocation stays ACTIVE across this.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.boarding", "create");
    if (denied) return errorResponse(denied, 403);

    const companyId = session.user.companyId;
    const body = await request.json();
    const validated = admitSchema.parse(body);

    const student = await prisma.schoolStudent.findFirst({
      where: { id: validated.studentId, companyId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!student) return errorResponse("Student not found", 404);

    if (validated.bedId) {
      const bed = await prisma.schoolHostelBed.findFirst({
        where: { id: validated.bedId, companyId },
        select: { id: true },
      });
      if (!bed) return errorResponse("Sick bay bed not found", 404);
    }

    // Two open admissions for one child would make "who is in the sick bay"
    // count them twice and leave a discharge ambiguous.
    const open = await prisma.schoolSickBayAdmission.findFirst({
      where: { companyId, studentId: student.id, dischargedAt: null },
      select: { id: true },
    });
    if (open) {
      return errorResponse(
        `${student.firstName} ${student.lastName} is already in the sick bay`,
        409,
      );
    }

    const termId = await resolveTermId(companyId, validated.termId);

    const admission = await prisma.schoolSickBayAdmission.create({
      data: {
        companyId,
        studentId: student.id,
        termId,
        bedId: validated.bedId ?? null,
        admittedAt: validated.admittedAt ? new Date(validated.admittedAt) : new Date(),
        reason: validated.reason,
        notes: validated.notes ?? null,
        admittedById: session.user.id,
      },
      include: sickBayInclude,
    });

    const held = await heldBeds(companyId, [admission.studentId]);

    return successResponse(
      { ...admission, heldBed: held.get(admission.studentId) ?? null },
      201,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof BoardingSessionError) {
      return errorResponse(error.message, error.status);
    }
    console.error("[API] POST /api/v2/schools/boarding/sick-bay error:", error);
    return errorResponse("Failed to admit to the sick bay");
  }
}
