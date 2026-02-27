import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { isUniqueConstraintError } from "../../_helpers";

const assignmentsQuerySchema = z.object({
  termId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  streamId: z.string().uuid().optional(),
  teacherProfileId: z.string().uuid().optional(),
  search: z.string().trim().min(1).optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

const createAssignmentSchema = z.object({
  termId: z.string().uuid(),
  classId: z.string().uuid(),
  streamId: z.string().uuid().nullable().optional(),
  subjectId: z.string().uuid(),
  teacherProfileId: z.string().uuid(),
  isActive: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);
    const companyId = session.user.companyId;

    const query = assignmentsQuerySchema.parse({
      termId: searchParams.get("termId") ?? undefined,
      classId: searchParams.get("classId") ?? undefined,
      streamId: searchParams.get("streamId") ?? undefined,
      teacherProfileId: searchParams.get("teacherProfileId") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      isActive: searchParams.get("isActive") ?? undefined,
    });

    const where = {
      companyId,
      ...(query.termId ? { termId: query.termId } : {}),
      ...(query.classId ? { classId: query.classId } : {}),
      ...(query.streamId ? { streamId: query.streamId } : {}),
      ...(query.teacherProfileId ? { teacherProfileId: query.teacherProfileId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { subject: { code: { contains: query.search, mode: "insensitive" as const } } },
              { subject: { name: { contains: query.search, mode: "insensitive" as const } } },
              { class: { code: { contains: query.search, mode: "insensitive" as const } } },
              { class: { name: { contains: query.search, mode: "insensitive" as const } } },
              {
                teacherProfile: {
                  user: { name: { contains: query.search, mode: "insensitive" as const } },
                },
              },
            ],
          }
        : {}),
    };

    const [records, total] = await Promise.all([
      prisma.schoolClassSubject.findMany({
        where,
        include: {
          term: { select: { id: true, code: true, name: true } },
          class: { select: { id: true, code: true, name: true } },
          stream: { select: { id: true, code: true, name: true } },
          subject: { select: { id: true, code: true, name: true, isCore: true, passMark: true } },
          teacherProfile: {
            select: {
              id: true,
              employeeCode: true,
              isClassTeacher: true,
              isHod: true,
              isActive: true,
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.schoolClassSubject.count({ where }),
    ]);

    return successResponse(paginationResponse(records, total, page, limit));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/teachers/assignments error:", error);
    return errorResponse("Failed to fetch class-subject assignments");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const body = await request.json();
    const validated = createAssignmentSchema.parse(body);

    const [term, schoolClass, stream, subject, teacherProfile] = await Promise.all([
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
      prisma.schoolSubject.findFirst({
        where: { id: validated.subjectId, companyId },
        select: { id: true },
      }),
      prisma.schoolTeacherProfile.findFirst({
        where: { id: validated.teacherProfileId, companyId },
        select: { id: true },
      }),
    ]);

    if (!term) return errorResponse("Invalid term for this company", 400);
    if (!schoolClass) return errorResponse("Invalid class for this company", 400);
    if (!subject) return errorResponse("Invalid subject for this company", 400);
    if (!teacherProfile) return errorResponse("Invalid teacher profile for this company", 400);
    if (validated.streamId && !stream) {
      return errorResponse("Invalid stream for this company", 400);
    }
    if (stream && stream.classId !== validated.classId) {
      return errorResponse("Selected stream does not belong to class", 400);
    }

    const created = await prisma.schoolClassSubject.create({
      data: {
        companyId,
        termId: validated.termId,
        classId: validated.classId,
        streamId: validated.streamId ?? null,
        subjectId: validated.subjectId,
        teacherProfileId: validated.teacherProfileId,
        isActive: validated.isActive ?? true,
      },
      include: {
        term: { select: { id: true, code: true, name: true } },
        class: { select: { id: true, code: true, name: true } },
        stream: { select: { id: true, code: true, name: true } },
        subject: { select: { id: true, code: true, name: true, isCore: true, passMark: true } },
        teacherProfile: {
          select: {
            id: true,
            employeeCode: true,
            isClassTeacher: true,
            isHod: true,
            isActive: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("Duplicate class-subject assignment for the same term", 409);
    }
    console.error("[API] POST /api/v2/schools/teachers/assignments error:", error);
    return errorResponse("Failed to create class-subject assignment");
  }
}
