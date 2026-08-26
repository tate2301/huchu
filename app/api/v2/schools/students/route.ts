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
import { buildCustomFieldValues } from "@/lib/crm/custom-fields";
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import {
  isUniqueConstraintError,
  normalizeOptionalNullableString,
  nullableDateInputSchema,
  schoolStudentStatusSchema,
  toNullableDate,
} from "../_helpers";

const booleanParamSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .optional();

const studentQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  status: schoolStudentStatusSchema.optional(),
  classId: z.string().uuid().optional(),
  streamId: z.string().uuid().optional(),
  isBoarding: booleanParamSchema,
  /**
   * Whether the pupil has claimed a portal account. `userId` is set by the
   * claim, so this is "has the child signed in yet" rather than "were they
   * invited" — which is the question the roll screen is actually asking.
   */
  hasPortalAccount: booleanParamSchema,
  /**
   * Opt in to the fee and attendance standing on each row.
   *
   * Two extra grouped queries over the page's pupils, so it is asked for
   * rather than always paid: the register, the attendance roster and every
   * picker that reads this route want names and nothing else.
   */
  withSummary: booleanParamSchema,
});

/** What the Fees column says about a pupil, in the school's words. */
type FeeStanding = "PAID" | "PARTIAL" | "OVERDUE" | "WAIVER" | "DUE" | "NOT_BILLED";

type StudentSummary = {
  fees: FeeStanding;
  /** Days not marked absent, over days registered. Null before any register. */
  attendanceRate: number | null;
  attendanceMarked: number;
  attendanceAbsent: number;
};

const studentGuardianLinkSchema = z.object({
  guardianId: z.string().uuid(),
  relationship: z.string().trim().min(1).max(120),
  isPrimary: z.boolean().optional(),
  canReceiveFinancials: z.boolean().optional(),
  canReceiveAcademicResults: z.boolean().optional(),
});

const createStudentSchema = z.object({
  studentNo: z.string().trim().min(1).max(40).optional(),
  admissionNo: z.string().trim().min(1).max(80).nullable().optional(),
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  dateOfBirth: nullableDateInputSchema,
  gender: z.string().trim().min(1).max(30).nullable().optional(),
  status: schoolStudentStatusSchema.optional(),
  currentClassId: z.string().uuid().nullable().optional(),
  currentStreamId: z.string().uuid().nullable().optional(),
  isBoarding: z.boolean().optional(),
  admissionDate: nullableDateInputSchema,
  guardianLinks: z.array(studentGuardianLinkSchema).optional(),
  /**
   * S-4.4 — the school's own fields, at the point the pupil is first written.
   *
   * PATCH has taken these since S-4.4; POST did not, so a registrar filling in
   * "bus route" on the create form saved a child and then silently lost it.
   * Validated by the same engine, with `partial: false` because a create is the
   * whole record and a required custom field is required here too.
   */
  customFields: z.record(z.string(), z.unknown()).optional(),
});

const studentInclude = {
  currentClass: { select: { id: true, code: true, name: true } },
  currentStream: { select: { id: true, code: true, name: true, classId: true } },
  guardianLinks: {
    include: {
      guardian: {
        select: {
          id: true,
          guardianNo: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
        },
      },
    },
  },
  _count: {
    select: {
      guardianLinks: true,
      enrollments: true,
      boardingAllocations: true,
      resultLines: true,
    },
  },
} satisfies Prisma.SchoolStudentInclude;

/**
 * Where each pupil on this page stands on fees and on attendance.
 *
 * Grouped queries over the page's ids rather than a join on the list itself:
 * a school with 900 on the roll reads 50 at a time, and two `groupBy` calls
 * over 50 ids cost less than carrying every invoice line into the include.
 *
 * Deliberately no money crosses the wire. A school billing in two currencies
 * has no meaningful single total — `GET /api/v2/schools/fees` divides each
 * document by the rate stamped on it for exactly that reason — and the column
 * this feeds is a badge, not a figure. Whether anything is late is currency-free.
 */
async function summariseStudents(
  companyId: string,
  studentIds: string[],
): Promise<Record<string, StudentSummary>> {
  if (studentIds.length === 0) return {};

  const now = new Date();
  const [feeTotals, overdue, attendance] = await Promise.all([
    prisma.schoolFeeInvoice.groupBy({
      by: ["studentId"],
      where: {
        companyId,
        studentId: { in: studentIds },
        // Drafts are not a bill yet and voided ones never were.
        status: { in: ["ISSUED", "PART_PAID", "PAID", "WRITEOFF"] },
      },
      _sum: { balanceAmount: true, paidAmount: true, waivedAmount: true },
      _count: { _all: true },
    }),
    prisma.schoolFeeInvoice.groupBy({
      by: ["studentId"],
      where: {
        companyId,
        studentId: { in: studentIds },
        status: { in: ["ISSUED", "PART_PAID"] },
        dueDate: { lt: now },
        balanceAmount: { gt: 0 },
      },
      _count: { _all: true },
    }),
    prisma.schoolAttendanceSessionLine.groupBy({
      by: ["studentId", "status"],
      where: { companyId, studentId: { in: studentIds } },
      _count: { _all: true },
    }),
  ]);

  const overdueBy = new Set(overdue.map((row) => row.studentId));
  const summary: Record<string, StudentSummary> = {};
  for (const id of studentIds) {
    summary[id] = {
      fees: "NOT_BILLED",
      attendanceRate: null,
      attendanceMarked: 0,
      attendanceAbsent: 0,
    };
  }

  for (const row of feeTotals) {
    const balance = Number(row._sum.balanceAmount ?? 0);
    const paid = Number(row._sum.paidAmount ?? 0);
    const waived = Number(row._sum.waivedAmount ?? 0);
    const standing: FeeStanding = overdueBy.has(row.studentId)
      ? "OVERDUE"
      : balance > 0
        ? paid > 0
          ? "PARTIAL"
          : "DUE"
        : waived > 0
          ? "WAIVER"
          : "PAID";
    summary[row.studentId] = { ...summary[row.studentId], fees: standing };
  }

  for (const row of attendance) {
    const entry = summary[row.studentId];
    if (!entry) continue;
    entry.attendanceMarked += row._count._all;
    // Late and excused are days the child was accounted for. Only an
    // unexplained absence counts against the rate a parent is shown.
    if (row.status === "ABSENT") entry.attendanceAbsent += row._count._all;
  }

  for (const entry of Object.values(summary)) {
    if (entry.attendanceMarked === 0) continue;
    entry.attendanceRate =
      Math.round(
        ((entry.attendanceMarked - entry.attendanceAbsent) / entry.attendanceMarked) * 1000,
      ) / 10;
  }

  return summary;
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.students", "view");
    if (denied) return errorResponse(denied, 403);
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);

    const query = studentQuerySchema.parse({
      search: searchParams.get("search") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      classId: searchParams.get("classId") ?? undefined,
      streamId: searchParams.get("streamId") ?? undefined,
      isBoarding: searchParams.get("isBoarding") ?? undefined,
      hasPortalAccount: searchParams.get("hasPortalAccount") ?? undefined,
      withSummary: searchParams.get("withSummary") ?? undefined,
    });

    const where: Prisma.SchoolStudentWhereInput = {
      companyId: session.user.companyId,
    };

    if (query.search) {
      where.OR = [
        { studentNo: { contains: query.search, mode: "insensitive" } },
        { admissionNo: { contains: query.search, mode: "insensitive" } },
        { firstName: { contains: query.search, mode: "insensitive" } },
        { lastName: { contains: query.search, mode: "insensitive" } },
      ];
    }
    if (query.status) where.status = query.status;
    if (query.classId) where.currentClassId = query.classId;
    if (query.streamId) where.currentStreamId = query.streamId;
    if (query.isBoarding !== undefined) where.isBoarding = query.isBoarding;
    if (query.hasPortalAccount !== undefined) {
      where.userId = query.hasPortalAccount ? { not: null } : null;
    }

    const [records, total] = await Promise.all([
      prisma.schoolStudent.findMany({
        where,
        include: studentInclude,
        // Class first, then surname — a register, which is the order a school
        // reads a student list in. `level` rather than `name` so the ladder
        // runs ECD, Grade 1…7, Form 1…6 instead of alphabetically by label.
        // Postgres sorts NULLs last on ASC, so students with no class land at
        // the end under their own heading rather than at the top.
        orderBy: [
          { currentClass: { level: "asc" } },
          { currentClass: { name: "asc" } },
          { currentStream: { name: "asc" } },
          { lastName: "asc" },
          { firstName: "asc" },
        ],
        skip,
        take: limit,
      }),
      prisma.schoolStudent.count({ where }),
    ]);

    const summary = query.withSummary
      ? await summariseStudents(
          session.user.companyId,
          records.map((record) => record.id),
        )
      : null;

    return successResponse({
      ...paginationResponse(records, total, page, limit),
      // Beside the rows rather than folded into them, so a caller that did not
      // ask for it gets exactly the shape it always got.
      ...(summary ? { summary } : {}),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/students error:", error);
    return errorResponse("Failed to fetch students");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.students", "create");
    if (denied) return errorResponse(denied, 403);

    const body = await request.json();
    const validated = createStudentSchema.parse(body);
    const companyId = session.user.companyId;

    let studentNo: string;
    try {
      studentNo = validated.studentNo
        ? normalizeProvidedId(validated.studentNo, "SCHOOL_STUDENT")
        : await reserveIdentifier(prisma, {
            companyId,
            entity: "SCHOOL_STUDENT",
          });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid student number format";
      return errorResponse(message, 400);
    }

    let classId = validated.currentClassId ?? null;
    const streamId = validated.currentStreamId ?? null;
    if (classId) {
      const schoolClass = await prisma.schoolClass.findFirst({
        where: { id: classId, companyId },
        select: { id: true },
      });
      if (!schoolClass) {
        return errorResponse("Invalid class for this company", 400);
      }
    }

    if (streamId) {
      const stream = await prisma.schoolStream.findFirst({
        where: { id: streamId, companyId },
        select: { id: true, classId: true },
      });
      if (!stream) {
        return errorResponse("Invalid stream for this company", 400);
      }
      if (classId && stream.classId !== classId) {
        return errorResponse("Stream does not belong to the selected class", 400);
      }
      if (!classId) classId = stream.classId;
    }

    const guardianLinks = validated.guardianLinks ?? [];
    const guardianIds = guardianLinks.map((link) => link.guardianId);
    const uniqueGuardianIds = new Set(guardianIds);
    if (uniqueGuardianIds.size !== guardianIds.length) {
      return errorResponse("Duplicate guardians are not allowed in one request", 400);
    }

    const primaryCount = guardianLinks.filter((link) => link.isPrimary).length;
    if (primaryCount > 1) {
      return errorResponse("Only one primary guardian can be assigned per student", 400);
    }

    if (guardianIds.length > 0) {
      const guardians = await prisma.schoolGuardian.findMany({
        where: { companyId, id: { in: guardianIds } },
        select: { id: true },
      });
      if (guardians.length !== guardianIds.length) {
        return errorResponse("One or more guardians are invalid for this company", 400);
      }
    }

    let customFields: Prisma.InputJsonValue | undefined;
    if (validated.customFields !== undefined) {
      const definitions = await prisma.crmFieldDefinition.findMany({
        where: { companyId, entity: "STUDENT", archivedAt: null },
      });
      const built = buildCustomFieldValues(definitions, validated.customFields);
      if (built.errors.length > 0) {
        return errorResponse("Validation failed", 400, built.errors);
      }
      customFields = built.values as Prisma.InputJsonValue;
    }

    const student = await prisma.schoolStudent.create({
      data: {
        companyId,
        ...(customFields !== undefined ? { customFields } : {}),
        studentNo,
        admissionNo: normalizeOptionalNullableString(validated.admissionNo) ?? null,
        firstName: validated.firstName,
        lastName: validated.lastName,
        dateOfBirth: toNullableDate(validated.dateOfBirth),
        gender: normalizeOptionalNullableString(validated.gender) ?? null,
        status: validated.status ?? "APPLICANT",
        currentClassId: classId,
        currentStreamId: streamId,
        isBoarding: validated.isBoarding ?? false,
        admissionDate: toNullableDate(validated.admissionDate),
        guardianLinks:
          guardianLinks.length > 0
            ? {
                create: guardianLinks.map((link) => ({
                  companyId,
                  guardianId: link.guardianId,
                  relationship: link.relationship,
                  isPrimary: link.isPrimary ?? false,
                  canReceiveFinancials: link.canReceiveFinancials ?? true,
                  canReceiveAcademicResults: link.canReceiveAcademicResults ?? true,
                })),
              }
            : undefined,
      },
      include: studentInclude,
    });

    return successResponse(student, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("Student number or admission number already exists", 409);
    }
    console.error("[API] POST /api/v2/schools/students error:", error);
    return errorResponse("Failed to create student");
  }
}
