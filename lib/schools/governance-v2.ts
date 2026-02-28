import type { Prisma, SchoolResultSheetStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const privilegedRoles = new Set([
  "SUPERADMIN",
  "MANAGER",
  "SCHOOL_ADMIN",
  "REGISTRAR",
  "BURSAR",
]);

export function isPrivilegedRole(role?: string | null) {
  return role ? privilegedRoles.has(role.toUpperCase()) : false;
}

export async function getTeacherProfile(companyId: string, userId: string) {
  return prisma.schoolTeacherProfile.findFirst({
    where: { companyId, userId, isActive: true },
    select: {
      id: true,
      userId: true,
      employeeCode: true,
      department: true,
      isClassTeacher: true,
      isHod: true,
      isActive: true,
    },
  });
}

export async function getTeacherAssignments(
  companyId: string,
  teacherProfileId: string,
  filters: {
    termId?: string;
    classId?: string;
    streamId?: string;
  } = {},
) {
  return prisma.schoolClassSubject.findMany({
    where: {
      companyId,
      teacherProfileId,
      isActive: true,
      ...(filters.termId ? { termId: filters.termId } : {}),
      ...(filters.classId ? { classId: filters.classId } : {}),
      ...(filters.streamId ? { streamId: filters.streamId } : {}),
    },
    select: {
      id: true,
      termId: true,
      classId: true,
      streamId: true,
      subjectId: true,
      subject: { select: { id: true, code: true, name: true } },
      class: { select: { id: true, code: true, name: true } },
      stream: { select: { id: true, code: true, name: true } },
      term: { select: { id: true, code: true, name: true } },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
}

export function buildAssignedResultSheetWhere(
  assignments: Array<{ termId: string; classId: string; streamId: string | null }>,
): Prisma.SchoolResultSheetWhereInput | null {
  if (!assignments.length) return null;
  const assignmentOr: Prisma.SchoolResultSheetWhereInput[] = assignments.map((assignment) => ({
    termId: assignment.termId,
    classId: assignment.classId,
    ...(assignment.streamId ? { streamId: assignment.streamId } : {}),
  }));
  return { OR: assignmentOr };
}

export async function canTeacherAccessResultSheet(
  companyId: string,
  userId: string,
  sheet: {
    termId: string;
    classId: string;
    streamId: string | null;
  },
) {
  const profile = await getTeacherProfile(companyId, userId);
  if (!profile) return false;

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
  return Boolean(assignment);
}

export async function findOpenPublishWindow(
  companyId: string,
  sheet: {
    termId: string;
    classId: string;
    streamId: string | null;
  },
  at = new Date(),
) {
  return prisma.schoolPublishWindow.findFirst({
    where: {
      companyId,
      termId: sheet.termId,
      status: "OPEN",
      openAt: { lte: at },
      closeAt: { gte: at },
      OR: [{ classId: null }, { classId: sheet.classId }],
      AND: [{ OR: [{ streamId: null }, { streamId: sheet.streamId }] }],
    },
    orderBy: [{ classId: "desc" }, { streamId: "desc" }, { openAt: "desc" }],
  });
}

export async function writeModerationAction(params: {
  companyId: string;
  sheetId: string;
  actorUserId: string;
  actionType:
    | "SUBMIT"
    | "REQUEST_CHANGES"
    | "HOD_APPROVE"
    | "PUBLISH"
    | "UNPUBLISH";
  fromStatus: SchoolResultSheetStatus;
  toStatus: SchoolResultSheetStatus;
  comment?: string | null;
}) {
  return prisma.schoolResultModerationAction.create({
    data: {
      companyId: params.companyId,
      sheetId: params.sheetId,
      actorUserId: params.actorUserId,
      actionType: params.actionType,
      fromStatus: params.fromStatus,
      toStatus: params.toStatus,
      comment: params.comment?.trim() || null,
      actedAt: new Date(),
    },
  });
}
