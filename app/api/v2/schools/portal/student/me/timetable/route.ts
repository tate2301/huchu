import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { isPrivilegedRole } from "@/lib/schools/governance-v2";

function deriveSlot(index: number) {
  const slots = [
    "P1 08:00",
    "P2 09:00",
    "P3 10:30",
    "P4 11:30",
    "P5 13:30",
    "P6 14:30",
  ];
  return slots[index % slots.length];
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { searchParams } = new URL(request.url);
    const requestedStudentId = searchParams.get("studentId");

    const privileged = isPrivilegedRole(session.user.role);
    const emailPrefix = session.user.email?.split("@")[0]?.trim()?.toUpperCase();

    const student = await prisma.schoolStudent.findFirst({
      where: {
        companyId,
        ...(privileged && requestedStudentId
          ? { id: requestedStudentId }
          : emailPrefix
            ? { studentNo: emailPrefix }
            : { id: "__none__" }),
      },
      select: {
        id: true,
        studentNo: true,
        firstName: true,
        lastName: true,
      },
    });
    if (!student) return errorResponse("Student profile not found", 404);

    const activeEnrollment = await prisma.schoolEnrollment.findFirst({
      where: {
        companyId,
        studentId: student.id,
        status: "ACTIVE",
      },
      select: {
        id: true,
        termId: true,
        classId: true,
        streamId: true,
        term: { select: { id: true, code: true, name: true } },
        class: { select: { id: true, code: true, name: true } },
        stream: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ enrolledAt: "desc" }],
    });
    if (!activeEnrollment) {
      return successResponse({
        success: true,
        data: {
          resource: "portal-student-me-timetable",
          companyId,
          student,
          enrollment: null,
          entries: [],
        },
      });
    }

    const assignments = await prisma.schoolClassSubject.findMany({
      where: {
        companyId,
        termId: activeEnrollment.termId,
        classId: activeEnrollment.classId,
        OR: [{ streamId: null }, { streamId: activeEnrollment.streamId }],
        isActive: true,
      },
      include: {
        subject: { select: { id: true, code: true, name: true } },
        teacherProfile: {
          select: {
            id: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: [{ subject: { name: "asc" } }],
      take: 200,
    });

    const entries = assignments.map((assignment, index) => ({
      id: assignment.id,
      slot: deriveSlot(index),
      subject: assignment.subject,
      teacher: assignment.teacherProfile.user,
      term: activeEnrollment.term,
      class: activeEnrollment.class,
      stream: activeEnrollment.stream,
    }));

    return successResponse({
      success: true,
      data: {
        resource: "portal-student-me-timetable",
        companyId,
        student,
        enrollment: activeEnrollment,
        entries,
      },
    });
  } catch (error) {
    console.error("[API] GET /api/v2/schools/portal/student/me/timetable error:", error);
    return errorResponse("Failed to fetch student timetable");
  }
}

