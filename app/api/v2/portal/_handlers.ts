import { NextRequest, NextResponse } from "next/server";
import { Prisma, type SchoolResultSheetStatus } from "@prisma/client";
import { z } from "zod";
import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import {
  buildAssignedResultSheetWhere,
  getTeacherAssignments,
  getTeacherProfile,
  isPrivilegedRole,
} from "@/lib/schools/governance-v2";

const parentPortalQuerySchema = z.object({
  guardianId: z.string().uuid().optional(),
  search: z.string().trim().min(1).optional(),
});

const studentPortalQuerySchema = z.object({
  studentId: z.string().uuid().optional(),
  studentNo: z.string().trim().min(1).max(40).optional(),
});

const teacherPortalQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  termId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  status: z
    .enum(["DRAFT", "SUBMITTED", "HOD_APPROVED", "HOD_REJECTED", "PUBLISHED"])
    .optional(),
});

function buildPortalEnvelope<T>(resource: string, companyId: string, payload: T) {
  return successResponse({
    success: true as const,
    data: {
      resource,
      companyId,
      ...payload,
    },
  });
}

export async function handleParentPortalGet(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const query = parentPortalQuerySchema.parse({
      guardianId: searchParams.get("guardianId") ?? undefined,
      search: searchParams.get("search") ?? undefined,
    });

    const companyId = session.user.companyId;
    const role = session.user.role;

    const privileged = isPrivilegedRole(role);
    if (!privileged && !session.user.email) {
      return buildPortalEnvelope("portal-parent", companyId, {
        guardian: null,
        children: [],
        results: [],
        boarding: [],
        fees: [],
        summary: {
          linkedChildren: 0,
          publishedResultLines: 0,
          activeBoardingAllocations: 0,
          outstandingBalance: 0,
          hasLinkedGuardian: false,
        },
      });
    }
    const guardianLookupWhere: Prisma.SchoolGuardianWhereInput = {
      companyId,
      ...(query.guardianId && privileged
        ? { id: query.guardianId }
        : session.user.email
          ? { email: { equals: session.user.email, mode: "insensitive" } }
          : {}),
    };

    let guardian = await prisma.schoolGuardian.findFirst({
      where: guardianLookupWhere,
      select: {
        id: true,
        guardianNo: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
      },
    });

    if (!guardian && !query.guardianId && privileged) {
      guardian = await prisma.schoolGuardian.findFirst({
        where: { companyId },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          guardianNo: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      });
    }

    if (!guardian) {
      return buildPortalEnvelope("portal-parent", companyId, {
        guardian: null,
        children: [],
        results: [],
        boarding: [],
        fees: [],
        summary: {
          linkedChildren: 0,
          publishedResultLines: 0,
          activeBoardingAllocations: 0,
          outstandingBalance: 0,
          hasLinkedGuardian: false,
        },
      });
    }

    const links = await prisma.schoolStudentGuardian.findMany({
      where: {
        companyId,
        guardianId: guardian.id,
        ...(query.search
          ? {
              OR: [
                {
                  student: {
                    studentNo: { contains: query.search, mode: "insensitive" },
                  },
                },
                {
                  student: {
                    firstName: { contains: query.search, mode: "insensitive" },
                  },
                },
                {
                  student: {
                    lastName: { contains: query.search, mode: "insensitive" },
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        student: {
          include: {
            currentClass: { select: { id: true, code: true, name: true } },
            currentStream: { select: { id: true, code: true, name: true } },
            enrollments: {
              where: { status: "ACTIVE" },
              include: {
                term: { select: { id: true, code: true, name: true } },
                class: { select: { id: true, code: true, name: true } },
                stream: { select: { id: true, code: true, name: true } },
              },
              orderBy: [{ enrolledAt: "desc" }],
              take: 1,
            },
          },
        },
      },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });

    const studentIds = links.map((link) => link.studentId);
    const academicEnabledStudentIds = links
      .filter((link) => link.canReceiveAcademicResults)
      .map((link) => link.studentId);
    const financeEnabledStudentIds = links
      .filter((link) => link.canReceiveFinancials)
      .map((link) => link.studentId);
    const [resultLines, boardingAllocations, feeInvoices] = await Promise.all([
      academicEnabledStudentIds.length > 0
        ? prisma.schoolResultLine.findMany({
            where: {
              companyId,
              studentId: { in: academicEnabledStudentIds },
              sheet: { status: "PUBLISHED" },
            },
            include: {
              student: {
                select: {
                  id: true,
                  studentNo: true,
                  firstName: true,
                  lastName: true,
                },
              },
              sheet: {
                select: {
                  id: true,
                  title: true,
                  status: true,
                  publishedAt: true,
                  term: { select: { id: true, code: true, name: true } },
                  class: { select: { id: true, code: true, name: true } },
                },
              },
            },
            orderBy: [{ updatedAt: "desc" }],
            take: 120,
          })
        : Promise.resolve([]),
      studentIds.length > 0
        ? prisma.schoolBoardingAllocation.findMany({
            where: {
              companyId,
              studentId: { in: studentIds },
            },
            include: {
              student: {
                select: {
                  id: true,
                  studentNo: true,
                  firstName: true,
                  lastName: true,
                },
              },
              term: { select: { id: true, code: true, name: true } },
              hostel: { select: { id: true, code: true, name: true } },
              room: { select: { id: true, code: true } },
              bed: { select: { id: true, code: true } },
            },
            orderBy: [{ startDate: "desc" }],
            take: 60,
          })
        : Promise.resolve([]),
      financeEnabledStudentIds.length > 0
        ? prisma.schoolFeeInvoice.findMany({
            where: {
              companyId,
              studentId: { in: financeEnabledStudentIds },
              status: { in: ["ISSUED", "PART_PAID", "PAID", "WRITEOFF", "VOIDED"] },
            },
            include: {
              student: {
                select: {
                  id: true,
                  studentNo: true,
                  firstName: true,
                  lastName: true,
                },
              },
              term: { select: { id: true, code: true, name: true } },
            },
            orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
            take: 120,
          })
        : Promise.resolve([]),
    ]);

    return buildPortalEnvelope("portal-parent", companyId, {
      guardian,
      children: links.map((link) => ({
        linkId: link.id,
        relationship: link.relationship,
        isPrimary: link.isPrimary,
        canReceiveFinancials: link.canReceiveFinancials,
        canReceiveAcademicResults: link.canReceiveAcademicResults,
        student: link.student,
      })),
      results: resultLines,
      boarding: boardingAllocations,
      fees: feeInvoices,
      summary: {
        linkedChildren: links.length,
        publishedResultLines: resultLines.length,
        activeBoardingAllocations: boardingAllocations.filter(
          (allocation) => allocation.status === "ACTIVE",
        ).length,
        outstandingBalance: feeInvoices.reduce(
          (sum, invoice) => sum + Math.max(invoice.balanceAmount, 0),
          0,
        ),
        hasLinkedGuardian: true,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/portal/parent error:", error);
    return errorResponse("Failed to fetch parent portal data");
  }
}

export async function handleStudentPortalGet(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const privileged = isPrivilegedRole(session.user.role);

    const { searchParams } = new URL(request.url);
    const query = studentPortalQuerySchema.parse({
      studentId: searchParams.get("studentId") ?? undefined,
      studentNo: searchParams.get("studentNo") ?? undefined,
    });

    const emailPrefix = session.user.email?.split("@")[0]?.trim() ?? null;
    if (!privileged && (query.studentId || query.studentNo)) {
      return errorResponse("Student portal does not allow overriding self scope", 403);
    }

    let student = await prisma.schoolStudent.findFirst({
      where: {
        companyId,
        ...(privileged && query.studentId
          ? { id: query.studentId }
          : privileged && query.studentNo
            ? { studentNo: query.studentNo.toUpperCase() }
            : emailPrefix
              ? { studentNo: emailPrefix.toUpperCase() }
              : {}),
      },
      include: {
        currentClass: { select: { id: true, code: true, name: true } },
        currentStream: { select: { id: true, code: true, name: true } },
      },
    });

    if (!student && privileged) {
      student = await prisma.schoolStudent.findFirst({
        where: { companyId },
        include: {
          currentClass: { select: { id: true, code: true, name: true } },
          currentStream: { select: { id: true, code: true, name: true } },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      });
    }

    if (!student) {
      return buildPortalEnvelope("portal-student", companyId, {
        student: null,
        enrollments: [],
        guardians: [],
        boarding: [],
        results: [],
        fees: [],
        summary: {
          hasLinkedStudent: false,
          enrollmentRecords: 0,
          publishedResultLines: 0,
          activeBoardingAllocations: 0,
          outstandingBalance: 0,
        },
      });
    }

    const [enrollments, guardianLinks, boardingAllocations, resultLines, feeInvoices] =
      await Promise.all([
        prisma.schoolEnrollment.findMany({
          where: { companyId, studentId: student.id },
          include: {
            term: { select: { id: true, code: true, name: true } },
            class: { select: { id: true, code: true, name: true } },
            stream: { select: { id: true, code: true, name: true } },
          },
          orderBy: [{ enrolledAt: "desc" }],
          take: 25,
        }),
        prisma.schoolStudentGuardian.findMany({
          where: { companyId, studentId: student.id },
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
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        }),
        prisma.schoolBoardingAllocation.findMany({
          where: { companyId, studentId: student.id },
          include: {
            term: { select: { id: true, code: true, name: true } },
            hostel: { select: { id: true, code: true, name: true } },
            room: { select: { id: true, code: true } },
            bed: { select: { id: true, code: true } },
          },
          orderBy: [{ startDate: "desc" }],
          take: 25,
        }),
        prisma.schoolResultLine.findMany({
          where: {
            companyId,
            studentId: student.id,
            sheet: { status: "PUBLISHED" },
          },
          include: {
            sheet: {
              select: {
                id: true,
                title: true,
                status: true,
                publishedAt: true,
                term: { select: { id: true, code: true, name: true } },
                class: { select: { id: true, code: true, name: true } },
              },
            },
          },
          orderBy: [{ updatedAt: "desc" }],
          take: 120,
        }),
        prisma.schoolFeeInvoice.findMany({
          where: {
            companyId,
            studentId: student.id,
            status: { in: ["ISSUED", "PART_PAID", "PAID", "WRITEOFF", "VOIDED"] },
          },
          include: {
            term: { select: { id: true, code: true, name: true } },
          },
          orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
          take: 120,
        }),
      ]);

    return buildPortalEnvelope("portal-student", companyId, {
      student,
      enrollments,
      guardians: guardianLinks,
      boarding: boardingAllocations,
      results: resultLines,
      fees: feeInvoices,
      summary: {
        hasLinkedStudent: true,
        enrollmentRecords: enrollments.length,
        publishedResultLines: resultLines.length,
        activeBoardingAllocations: boardingAllocations.filter(
          (allocation) => allocation.status === "ACTIVE",
        ).length,
        outstandingBalance: feeInvoices.reduce(
          (sum, invoice) => sum + Math.max(invoice.balanceAmount, 0),
          0,
        ),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/portal/student error:", error);
    return errorResponse("Failed to fetch student portal data");
  }
}

async function fetchTeacherStatusCount(
  companyId: string,
  status: SchoolResultSheetStatus,
  assignmentScope: Prisma.SchoolResultSheetWhereInput | null,
) {
  const where: Prisma.SchoolResultSheetWhereInput = {
    companyId,
    status,
    ...(assignmentScope ? { AND: [assignmentScope] } : {}),
  };
  return prisma.schoolResultSheet.count({ where });
}

export async function handleTeacherPortalGet(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);
    const query = teacherPortalQuerySchema.parse({
      search: searchParams.get("search") ?? undefined,
      termId: searchParams.get("termId") ?? undefined,
      classId: searchParams.get("classId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    });

    const where: Prisma.SchoolResultSheetWhereInput = {
      companyId,
    };
    if (query.status) where.status = query.status;
    if (query.termId) where.termId = query.termId;
    if (query.classId) where.classId = query.classId;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: "insensitive" } },
        { class: { name: { contains: query.search, mode: "insensitive" } } },
        { class: { code: { contains: query.search, mode: "insensitive" } } },
        { term: { name: { contains: query.search, mode: "insensitive" } } },
        { stream: { name: { contains: query.search, mode: "insensitive" } } },
      ];
    }

    const privileged = isPrivilegedRole(session.user.role);
    const teacherProfile = privileged
      ? null
      : await getTeacherProfile(companyId, session.user.id);
    const assignments =
      !privileged && teacherProfile
        ? await getTeacherAssignments(companyId, teacherProfile.id, {
            ...(query.termId ? { termId: query.termId } : {}),
            ...(query.classId ? { classId: query.classId } : {}),
          })
        : [];

    const assignmentScope = !privileged
      ? buildAssignedResultSheetWhere(
          assignments.map((assignment) => ({
            termId: assignment.termId,
            classId: assignment.classId,
            streamId: assignment.streamId,
          })),
        )
      : null;

    if (!privileged) {
      if (!teacherProfile || !assignmentScope) {
        const empty = paginationResponse([], 0, page, limit);
        return buildPortalEnvelope("portal-teacher", companyId, {
          ...empty,
          teacherProfile,
          assignmentSummary: {
            assignments: 0,
            uniqueClasses: 0,
            uniqueTerms: 0,
          },
          summary: {
            draftSheets: 0,
            submittedSheets: 0,
            hodRejectedSheets: 0,
            hodApprovedSheets: 0,
            publishedSheets: 0,
          },
        });
      }
      if (!where.AND) {
        where.AND = [assignmentScope];
      } else if (Array.isArray(where.AND)) {
        where.AND = [...where.AND, assignmentScope];
      } else {
        where.AND = [where.AND, assignmentScope];
      }
    }

    const [records, total] = await Promise.all([
      prisma.schoolResultSheet.findMany({
        where,
        include: {
          term: { select: { id: true, code: true, name: true } },
          class: { select: { id: true, code: true, name: true } },
          stream: { select: { id: true, code: true, name: true } },
          _count: { select: { lines: true } },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.schoolResultSheet.count({ where }),
    ]);

    const lineStats = records.length
      ? await prisma.schoolResultLine.groupBy({
          by: ["sheetId"],
          where: {
            companyId,
            sheetId: { in: records.map((record) => record.id) },
          },
          _avg: { score: true },
          _count: { _all: true },
        })
      : [];

    const statsMap = new Map(
      lineStats.map((entry) => [
        entry.sheetId,
        {
          averageScore: entry._avg.score ?? null,
          linesCount: entry._count._all,
        },
      ]),
    );

    const queueCounts = await Promise.all([
      fetchTeacherStatusCount(
        companyId,
        "DRAFT",
        assignmentScope,
      ),
      fetchTeacherStatusCount(
        companyId,
        "SUBMITTED",
        assignmentScope,
      ),
      fetchTeacherStatusCount(
        companyId,
        "HOD_REJECTED",
        assignmentScope,
      ),
      fetchTeacherStatusCount(
        companyId,
        "HOD_APPROVED",
        assignmentScope,
      ),
      fetchTeacherStatusCount(
        companyId,
        "PUBLISHED",
        assignmentScope,
      ),
    ]);

    const paged = paginationResponse(
      records.map((record) => ({
        ...record,
        stats: statsMap.get(record.id) ?? {
          averageScore: null,
          linesCount: record._count.lines,
        },
      })),
      total,
      page,
      limit,
    );

    return buildPortalEnvelope("portal-teacher", companyId, {
      ...paged,
      teacherProfile,
      assignmentSummary: {
        assignments: assignments.length,
        uniqueClasses: new Set(assignments.map((assignment) => assignment.classId))
          .size,
        uniqueTerms: new Set(assignments.map((assignment) => assignment.termId)).size,
      },
      summary: {
        draftSheets: queueCounts[0],
        submittedSheets: queueCounts[1],
        hodRejectedSheets: queueCounts[2],
        hodApprovedSheets: queueCounts[3],
        publishedSheets: queueCounts[4],
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/portal/teacher error:", error);
    return errorResponse("Failed to fetch teacher portal data");
  }
}
