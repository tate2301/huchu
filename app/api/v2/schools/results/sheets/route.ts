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
import { isUniqueConstraintError, schoolResultSheetStatusSchema } from "../../_helpers";
import {
  buildAssignedResultSheetWhere,
  getTeacherAssignments,
  getTeacherProfile,
  isPrivilegedRole,
} from "@/lib/schools/governance-v2";

const resultSheetQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  termId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  streamId: z.string().uuid().optional(),
  status: schoolResultSheetStatusSchema.optional(),
  includeLines: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

const resultLineSchema = z.object({
  studentId: z.string().uuid(),
  subjectCode: z.string().trim().min(1).max(40),
  score: z.number().finite().min(0).max(100),
  grade: z.string().trim().min(1).max(10).nullable().optional(),
  remarks: z.string().trim().min(1).max(500).nullable().optional(),
});

const createResultSheetSchema = z.object({
  termId: z.string().uuid(),
  classId: z.string().uuid(),
  streamId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200),
  lines: z.array(resultLineSchema).optional(),
});

const baseSheetInclude = {
  term: { select: { id: true, code: true, name: true } },
  class: { select: { id: true, code: true, name: true } },
  stream: { select: { id: true, code: true, name: true } },
  _count: { select: { lines: true } },
} satisfies Prisma.SchoolResultSheetInclude;

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);

    const query = resultSheetQuerySchema.parse({
      search: searchParams.get("search") ?? undefined,
      termId: searchParams.get("termId") ?? undefined,
      classId: searchParams.get("classId") ?? undefined,
      streamId: searchParams.get("streamId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      includeLines: searchParams.get("includeLines") ?? undefined,
    });

    const where: Prisma.SchoolResultSheetWhereInput = {
      companyId: session.user.companyId,
    };
    if (query.search) {
      where.title = { contains: query.search, mode: "insensitive" };
    }
    if (query.termId) where.termId = query.termId;
    if (query.classId) where.classId = query.classId;
    if (query.streamId) where.streamId = query.streamId;
    if (query.status) where.status = query.status;

    if (!isPrivilegedRole(session.user.role)) {
      const profile = await getTeacherProfile(session.user.companyId, session.user.id);
      if (!profile) {
        return successResponse(paginationResponse([], 0, page, limit));
      }
      const assignments = await getTeacherAssignments(session.user.companyId, profile.id, {
        ...(query.termId ? { termId: query.termId } : {}),
        ...(query.classId ? { classId: query.classId } : {}),
        ...(query.streamId ? { streamId: query.streamId } : {}),
      });
      const assignmentScope = buildAssignedResultSheetWhere(
        assignments.map((assignment) => ({
          termId: assignment.termId,
          classId: assignment.classId,
          streamId: assignment.streamId,
        })),
      );
      if (!assignmentScope) {
        return successResponse(paginationResponse([], 0, page, limit));
      }
      if (!where.AND) {
        where.AND = [assignmentScope];
      } else if (Array.isArray(where.AND)) {
        where.AND = [...where.AND, assignmentScope];
      } else {
        where.AND = [where.AND, assignmentScope];
      }
    }

    const include = query.includeLines
      ? ({
          ...baseSheetInclude,
          lines: {
            include: {
              student: {
                select: {
                  id: true,
                  studentNo: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
            orderBy: [{ studentId: "asc" }, { subjectCode: "asc" }],
          },
        } satisfies Prisma.SchoolResultSheetInclude)
      : baseSheetInclude;

    const [records, total] = await Promise.all([
      prisma.schoolResultSheet.findMany({
        where,
        include,
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.schoolResultSheet.count({ where }),
    ]);

    return successResponse(paginationResponse(records, total, page, limit));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/results/sheets error:", error);
    return errorResponse("Failed to fetch result sheets");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = createResultSheetSchema.parse(body);
    const companyId = session.user.companyId;

    const [term, schoolClass, stream] = await Promise.all([
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

    if (!term) return errorResponse("Invalid term for this company", 400);
    if (!schoolClass) return errorResponse("Invalid class for this company", 400);
    if (validated.streamId && !stream) {
      return errorResponse("Invalid stream for this company", 400);
    }
    if (stream && stream.classId !== validated.classId) {
      return errorResponse("Stream does not belong to the selected class", 400);
    }
    if (!isPrivilegedRole(session.user.role)) {
      const profile = await getTeacherProfile(companyId, session.user.id);
      if (!profile) {
        return errorResponse("Active teacher profile is required to create result sheets", 403);
      }
      const assignment = await prisma.schoolClassSubject.findFirst({
        where: {
          companyId,
          teacherProfileId: profile.id,
          isActive: true,
          termId: validated.termId,
          classId: validated.classId,
          OR: [{ streamId: null }, { streamId: validated.streamId ?? null }],
        },
        select: { id: true },
      });
      if (!assignment) {
        return errorResponse("You are not assigned to this class/stream for the selected term", 403);
      }
    }

    const lines = validated.lines ?? [];
    if (lines.length > 0) {
      const dedupeSet = new Set<string>();
      for (const line of lines) {
        const key = `${line.studentId}|${line.subjectCode.trim().toUpperCase()}`;
        if (dedupeSet.has(key)) {
          return errorResponse("Duplicate student+subject lines are not allowed", 400);
        }
        dedupeSet.add(key);
      }

      const studentIds = [...new Set(lines.map((line) => line.studentId))];
      const studentCount = await prisma.schoolStudent.count({
        where: {
          companyId,
          id: { in: studentIds },
        },
      });
      if (studentCount !== studentIds.length) {
        return errorResponse("One or more line students are invalid for this company", 400);
      }
    }

    const sheet = await prisma.$transaction(async (tx) => {
      const created = await tx.schoolResultSheet.create({
        data: {
          companyId,
          termId: validated.termId,
          classId: validated.classId,
          streamId: validated.streamId ?? null,
          title: validated.title,
          status: "DRAFT",
        },
      });

      if (lines.length > 0) {
        await tx.schoolResultLine.createMany({
          data: lines.map((line) => ({
            companyId,
            sheetId: created.id,
            studentId: line.studentId,
            subjectCode: line.subjectCode.trim().toUpperCase(),
            score: line.score,
            grade: line.grade ?? null,
            remarks: line.remarks ?? null,
          })),
        });
      }

      return tx.schoolResultSheet.findUnique({
        where: { id: created.id },
        include: {
          ...baseSheetInclude,
          lines: {
            include: {
              student: {
                select: {
                  id: true,
                  studentNo: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
            orderBy: [{ studentId: "asc" }, { subjectCode: "asc" }],
          },
        },
      });
    });

    if (!sheet) {
      return errorResponse("Failed to create result sheet", 500);
    }
    return successResponse(sheet, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("Duplicate result line detected", 409);
    }
    console.error("[API] POST /api/v2/schools/results/sheets error:", error);
    return errorResponse("Failed to create result sheet");
  }
}
