import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import {
  isUniqueConstraintError,
  normalizeOptionalNullableString,
  nullableDateInputSchema,
  optionalDateInputSchema,
  schoolEnrollmentStatusSchema,
  toNullableDate,
  toOptionalDate,
} from "../_helpers";

const enrollmentQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  studentId: z.string().uuid().optional(),
  termId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  streamId: z.string().uuid().optional(),
  status: schoolEnrollmentStatusSchema.optional(),
});

const createEnrollmentSchema = z.object({
  studentId: z.string().uuid(),
  termId: z.string().uuid(),
  classId: z.string().uuid(),
  streamId: z.string().uuid().nullable().optional(),
  status: schoolEnrollmentStatusSchema.optional(),
  enrolledAt: optionalDateInputSchema,
  endedAt: nullableDateInputSchema,
  notes: z.string().trim().min(1).max(1000).nullable().optional(),
});

/**
 * Correcting an enrolment, and taking one back out.
 *
 * A `SchoolEnrollment` is one row per pupil per term, and it is stamped with
 * whichever term was open on the day the office wrote it. A Form 1 intake taken
 * in September for the following January therefore lands in last year's third
 * term, which is wrong on the class list, wrong on the year roll-up, and — until
 * now — permanent: the row could be created and then nothing in the API could
 * touch it again.
 *
 * `edit` rather than the `create` the POST above asks for. The same two people
 * hold both on `schools.admissions` — the head and the registrar, and the
 * registrar is who keeps the roll — so the gate is the same set either way, and
 * "edit" is what this actually is.
 *
 * Every id in the body is a claim. The enrolment, the term, the class and the
 * stream are each resolved against the caller's company before anything is
 * written, because `update({ where: { id } })` cannot be company-scoped and that
 * resolution is the whole of the tenant boundary.
 */
const patchEnrollmentSchema = z.object({
  id: z.string().uuid(),
  termId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  // `nullish`, so an explicit null takes the pupil out of a stream and an absent
  // field leaves the stream they are in alone.
  streamId: z.string().uuid().nullish(),
  status: schoolEnrollmentStatusSchema.optional(),
});

const deleteEnrollmentQuerySchema = z.object({
  id: z.string().uuid(),
});

const enrollmentInclude = {
  student: {
    select: {
      id: true,
      studentNo: true,
      firstName: true,
      lastName: true,
      status: true,
      currentClassId: true,
      currentStreamId: true,
    },
  },
  term: { select: { id: true, code: true, name: true } },
  class: { select: { id: true, code: true, name: true } },
  stream: { select: { id: true, code: true, name: true } },
} satisfies Prisma.SchoolEnrollmentInclude;

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.admissions", "view");
    if (denied) return errorResponse(denied, 403);
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);

    const query = enrollmentQuerySchema.parse({
      search: searchParams.get("search") ?? undefined,
      studentId: searchParams.get("studentId") ?? undefined,
      termId: searchParams.get("termId") ?? undefined,
      classId: searchParams.get("classId") ?? undefined,
      streamId: searchParams.get("streamId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    });

    const where: Prisma.SchoolEnrollmentWhereInput = {
      companyId: session.user.companyId,
    };

    if (query.search) {
      where.student = {
        OR: [
          { studentNo: { contains: query.search, mode: "insensitive" } },
          { firstName: { contains: query.search, mode: "insensitive" } },
          { lastName: { contains: query.search, mode: "insensitive" } },
        ],
      };
    }
    if (query.studentId) where.studentId = query.studentId;
    if (query.termId) where.termId = query.termId;
    if (query.classId) where.classId = query.classId;
    if (query.streamId) where.streamId = query.streamId;
    if (query.status) where.status = query.status;

    const [records, total] = await Promise.all([
      prisma.schoolEnrollment.findMany({
        where,
        include: enrollmentInclude,
        orderBy: [{ enrolledAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.schoolEnrollment.count({ where }),
    ]);

    return successResponse(paginationResponse(records, total, page, limit));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/enrollments error:", error);
    return errorResponse("Failed to fetch enrollments");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.admissions", "create");
    if (denied) return errorResponse(denied, 403);

    const body = await request.json();
    const validated = createEnrollmentSchema.parse(body);
    const companyId = session.user.companyId;

    const [student, term, schoolClass, stream] = await Promise.all([
      prisma.schoolStudent.findFirst({
        where: { id: validated.studentId, companyId },
        select: { id: true },
      }),
      prisma.schoolTerm.findFirst({
        where: { id: validated.termId, companyId },
        select: { id: true },
      }),
      prisma.schoolClass.findFirst({
        where: { id: validated.classId, companyId },
        select: { id: true },
      }),
      validated.streamId
        ? prisma.schoolStream.findFirst({
            where: { id: validated.streamId, companyId },
            select: { id: true, classId: true },
          })
        : Promise.resolve(null),
    ]);

    if (!student) return errorResponse("Invalid student for this company", 400);
    if (!term) return errorResponse("Invalid term for this company", 400);
    if (!schoolClass) return errorResponse("Invalid class for this company", 400);
    if (validated.streamId && !stream) {
      return errorResponse("Invalid stream for this company", 400);
    }
    if (stream && stream.classId !== validated.classId) {
      return errorResponse("Stream does not belong to the selected class", 400);
    }

    const enrolledAt = toOptionalDate(validated.enrolledAt) ?? new Date();
    const endedAt = toNullableDate(validated.endedAt);
    if (endedAt && endedAt < enrolledAt) {
      return errorResponse("endedAt cannot be before enrolledAt", 400);
    }

    const enrollment = await prisma.$transaction(async (tx) => {
      const created = await tx.schoolEnrollment.create({
        data: {
          companyId,
          studentId: validated.studentId,
          termId: validated.termId,
          classId: validated.classId,
          streamId: validated.streamId ?? null,
          status: validated.status ?? "ACTIVE",
          enrolledAt,
          endedAt,
          notes: normalizeOptionalNullableString(validated.notes) ?? null,
        },
        include: enrollmentInclude,
      });

      if ((validated.status ?? "ACTIVE") === "ACTIVE") {
        await tx.schoolStudent.update({
          where: { id: validated.studentId },
          data: {
            status: "ACTIVE",
            currentClassId: validated.classId,
            currentStreamId: validated.streamId ?? null,
          },
        });
      }

      return created;
    });

    return successResponse(enrollment, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse(
        "Enrollment already exists for this student and term",
        409,
      );
    }
    console.error("[API] POST /api/v2/schools/enrollments error:", error);
    return errorResponse("Failed to create enrollment");
  }
}


export async function PATCH(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.admissions", "edit");
    if (denied) return errorResponse(denied, 403);

    const validated = patchEnrollmentSchema.parse(await request.json());
    const companyId = session.user.companyId;

    // The id is a claim until it is resolved against the caller's company.
    const existing = await prisma.schoolEnrollment.findFirst({
      where: { id: validated.id, companyId },
      select: {
        id: true,
        studentId: true,
        termId: true,
        classId: true,
        streamId: true,
        status: true,
      },
    });
    if (!existing) return errorResponse("That enrolment is not this school's.", 404);

    // What the row will say once this patch lands. The checks below run against
    // these rather than against what was sent, because a patch that moves the
    // class alone still has to answer for the stream the row already carries.
    const nextTermId = validated.termId ?? existing.termId;
    const nextClassId = validated.classId ?? existing.classId;
    const nextStreamId =
      validated.streamId !== undefined ? validated.streamId : existing.streamId;
    const nextStatus = validated.status ?? existing.status;

    const [term, schoolClass, stream] = await Promise.all([
      prisma.schoolTerm.findFirst({
        where: { id: nextTermId, companyId },
        select: { id: true, isActive: true },
      }),
      prisma.schoolClass.findFirst({
        where: { id: nextClassId, companyId },
        select: { id: true },
      }),
      nextStreamId
        ? prisma.schoolStream.findFirst({
            where: { id: nextStreamId, companyId },
            select: { id: true, classId: true },
          })
        : Promise.resolve(null),
    ]);

    if (!term) return errorResponse("Invalid term for this company", 400);
    if (!schoolClass) return errorResponse("Invalid class for this company", 400);
    if (nextStreamId && !stream) {
      return errorResponse("Invalid stream for this company", 400);
    }
    if (stream && stream.classId !== nextClassId) {
      return errorResponse(
        "That stream is not in that class. Pick one of the new class's streams, or clear the stream.",
        400,
      );
    }

    const enrollment = await prisma.$transaction(async (tx) => {
      const updated = await tx.schoolEnrollment.update({
        where: { id: existing.id },
        data: {
          ...(validated.termId !== undefined ? { termId: validated.termId } : {}),
          ...(validated.classId !== undefined ? { classId: validated.classId } : {}),
          ...(validated.streamId !== undefined ? { streamId: validated.streamId } : {}),
          ...(validated.status !== undefined ? { status: validated.status } : {}),
        },
        include: enrollmentInclude,
      });

      /*
        The pupil's own record carries where they are now, and the POST sets it
        when it writes an active enrolment. A correction has to keep it in step
        or the class list and the pupil's record disagree about which form room
        they sit in.

        Only from the open term, though. Patching a closed term's row — which is
        exactly what "this was written into the wrong term" means — must not
        reach up and move a child who is somewhere else this term.
      */
      if (nextStatus === "ACTIVE" && term.isActive) {
        await tx.schoolStudent.update({
          where: { id: existing.studentId },
          data: { currentClassId: nextClassId, currentStreamId: nextStreamId },
        });
      }

      return updated;
    });

    return successResponse(enrollment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse(
        "This pupil already has an enrolment in that term.",
        409,
      );
    }
    console.error("[API] PATCH /api/v2/schools/enrollments error:", error);
    return errorResponse("Failed to change the enrolment");
  }
}

/**
 * Take an enrolment back off the roll.
 *
 * The exception to retire-rather-than-delete, and `@@unique([companyId,
 * studentId, termId])` is why. An enrolment written into the wrong term is not
 * history, it is a typo — and while it sits there the right row cannot be
 * created at all, because the pair is already taken. Withdrawing it would leave
 * the same block in place. Status is still the right answer for a pupil who
 * actually left mid-term; this is for the row that should never have existed.
 *
 * It refuses once the term has evidence against that pupil. A register marked
 * or a mark entered means somebody taught this child in this term, and an
 * enrolment holding that up is a record rather than a mistake — so the refusal
 * says which of the two it found and leaves the row alone.
 */
export async function DELETE(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.admissions", "edit");
    if (denied) return errorResponse(denied, 403);

    const { searchParams } = new URL(request.url);
    const query = deleteEnrollmentQuerySchema.parse({
      id: searchParams.get("id") ?? undefined,
    });
    const companyId = session.user.companyId;

    const existing = await prisma.schoolEnrollment.findFirst({
      where: { id: query.id, companyId },
      select: { id: true, studentId: true, termId: true },
    });
    if (!existing) return errorResponse("That enrolment is not this school's.", 404);

    const [attendanceMarks, resultLines] = await Promise.all([
      prisma.schoolAttendanceSessionLine.count({
        where: {
          companyId,
          studentId: existing.studentId,
          session: { termId: existing.termId },
        },
      }),
      prisma.schoolResultLine.count({
        where: {
          companyId,
          studentId: existing.studentId,
          sheet: { termId: existing.termId },
        },
      }),
    ]);

    if (attendanceMarks > 0 || resultLines > 0) {
      const found = [
        attendanceMarks > 0
          ? `${attendanceMarks} attendance ${attendanceMarks === 1 ? "mark" : "marks"}`
          : null,
        resultLines > 0
          ? `${resultLines} ${resultLines === 1 ? "mark" : "marks"} on a result sheet`
          : null,
      ].filter((entry): entry is string => Boolean(entry));

      return errorResponse(
        `This pupil already has ${found.join(" and ")} in that term, so the enrolment is a record now. Set it to Withdrawn or Transferred instead.`,
        409,
      );
    }

    await prisma.schoolEnrollment.delete({ where: { id: existing.id } });

    return successResponse({ id: existing.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] DELETE /api/v2/schools/enrollments error:", error);
    return errorResponse("Failed to remove the enrolment");
  }
}
