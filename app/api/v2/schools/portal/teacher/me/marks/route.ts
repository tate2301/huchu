import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { getTeacherProfile, isPrivilegedRole } from "@/lib/schools/governance-v2";

const marksPayloadSchema = z.object({
  sheetId: z.string().uuid(),
  entries: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        subjectCode: z.string().trim().min(1).max(40),
        score: z.number().finite().min(0).max(100),
        grade: z.string().trim().min(1).max(10).optional(),
        remarks: z.string().trim().max(500).optional(),
      }),
    )
    .min(1)
    .max(600),
});

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const body = await request.json();
    const validated = marksPayloadSchema.parse(body);

    const sheet = await prisma.schoolResultSheet.findFirst({
      where: { id: validated.sheetId, companyId },
      select: {
        id: true,
        termId: true,
        classId: true,
        streamId: true,
        status: true,
      },
    });
    if (!sheet) return errorResponse("Result sheet not found", 404);
    if (sheet.status !== "DRAFT" && sheet.status !== "HOD_REJECTED") {
      return errorResponse("Marks can only be edited on draft or HOD-rejected sheets", 409);
    }

    if (!isPrivilegedRole(session.user.role)) {
      const profile = await getTeacherProfile(companyId, session.user.id);
      if (!profile) {
        return errorResponse("Active teacher profile is required for mark capture", 403);
      }
      const assignment = await prisma.schoolClassSubject.findFirst({
        where: {
          companyId,
          teacherProfileId: profile.id,
          isActive: true,
          termId: sheet.termId,
          classId: sheet.classId,
          OR: [{ streamId: null }, { streamId: sheet.streamId }],
        },
        select: { id: true },
      });
      if (!assignment) {
        return errorResponse("You are not assigned to this class/stream marksheet scope", 403);
      }
    }

    const dedupe = new Set<string>();
    for (const entry of validated.entries) {
      const key = `${entry.studentId}|${entry.subjectCode.toUpperCase()}`;
      if (dedupe.has(key)) {
        return errorResponse("Duplicate student and subject entries are not allowed", 400);
      }
      dedupe.add(key);
    }
    const studentIds = [...new Set(validated.entries.map((entry) => entry.studentId))];
    const studentCount = await prisma.schoolStudent.count({
      where: {
        companyId,
        id: { in: studentIds },
        currentClassId: sheet.classId,
      },
    });
    if (studentCount !== studentIds.length) {
      return errorResponse("One or more students are outside the result sheet class scope", 400);
    }

    const upserted = await prisma.$transaction(async (tx) => {
      const rows = [];
      for (const entry of validated.entries) {
        const row = await tx.schoolResultLine.upsert({
          where: {
            companyId_sheetId_studentId_subjectCode: {
              companyId,
              sheetId: sheet.id,
              studentId: entry.studentId,
              subjectCode: entry.subjectCode.trim().toUpperCase(),
            },
          },
          update: {
            score: entry.score,
            grade: entry.grade?.trim() || null,
            remarks: entry.remarks?.trim() || null,
          },
          create: {
            companyId,
            sheetId: sheet.id,
            studentId: entry.studentId,
            subjectCode: entry.subjectCode.trim().toUpperCase(),
            score: entry.score,
            grade: entry.grade?.trim() || null,
            remarks: entry.remarks?.trim() || null,
          },
          select: {
            id: true,
            studentId: true,
            subjectCode: true,
            score: true,
            grade: true,
            remarks: true,
            updatedAt: true,
          },
        });
        rows.push(row);
      }
      return rows;
    });

    return successResponse({
      success: true,
      data: {
        resource: "portal-teacher-marks",
        companyId,
        sheetId: sheet.id,
        updatedCount: upserted.length,
        entries: upserted,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/schools/portal/teacher/me/marks error:", error);
    return errorResponse("Failed to submit teacher marks");
  }
}

