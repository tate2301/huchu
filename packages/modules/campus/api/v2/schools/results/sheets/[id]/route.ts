import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "../../../../../../permissions";
import {
  canTeacherAccessResultSheet,
  isPrivilegedRole,
} from "../../../../../../governance-v2";

/**
 * One result sheet: read it, rename it, throw it away.
 *
 * The workflow verbs each had a route of their own from the start, but the
 * record underneath them had none — a sheet could be submitted, approved and
 * published without anybody ever being able to correct the title it carried or
 * delete one raised by mistake. The five sibling routes here are the only
 * writes that existed, so this one copies their guards exactly: same session
 * check, same tenant check, same teacher-assignment scope.
 */

const updateResultSheetSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  termId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  streamId: z.string().uuid().nullable().optional(),
});

const sheetInclude = {
  term: { select: { id: true, code: true, name: true } },
  class: { select: { id: true, code: true, name: true } },
  stream: { select: { id: true, code: true, name: true } },
  _count: { select: { lines: true } },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.results", "view");
    if (denied) return errorResponse(denied, 403);
    const { id } = await params;

    const sheet = await prisma.schoolResultSheet.findUnique({
      where: { id },
      include: {
        ...sheetInclude,
        lines: {
          include: {
            student: {
              select: { id: true, studentNo: true, firstName: true, lastName: true },
            },
          },
          orderBy: [{ subjectCode: "asc" }, { studentId: "asc" }],
        },
        // The moderation trail is the answer to "why was this sent back?", and
        // nothing read it before this route existed — the note a head of
        // department typed went into the table and was never shown again.
        moderationActions: {
          include: { actor: { select: { id: true, name: true } } },
          orderBy: { actedAt: "desc" },
          take: 50,
        },
      },
    });
    if (!sheet || sheet.companyId !== session.user.companyId) {
      return errorResponse("Result sheet not found", 404);
    }
    if (!isPrivilegedRole(session.user.role)) {
      const hasAccess = await canTeacherAccessResultSheet(
        session.user.companyId,
        session.user.id,
        { termId: sheet.termId, classId: sheet.classId, streamId: sheet.streamId },
      );
      if (!hasAccess) {
        return errorResponse("You are not assigned to this class/stream result sheet", 403);
      }
    }

    return successResponse(sheet);
  } catch (error) {
    console.error("[API] GET /api/v2/schools/results/sheets/[id] error:", error);
    return errorResponse("Failed to fetch result sheet");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.results", "edit");
    if (denied) return errorResponse(denied, 403);
    const { id } = await params;
    const validated = updateResultSheetSchema.parse(await request.json());
    const companyId = session.user.companyId;

    const existing = await prisma.schoolResultSheet.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        status: true,
        termId: true,
        classId: true,
        streamId: true,
      },
    });
    if (!existing || existing.companyId !== companyId) {
      return errorResponse("Result sheet not found", 404);
    }
    // A published sheet is on report cards families have already seen. Correct
    // it by unpublishing first, so the correction leaves a moderation trail.
    if (existing.status === "PUBLISHED") {
      return errorResponse("Unpublish this sheet before editing it", 400);
    }

    const movingScope =
      validated.termId !== undefined ||
      validated.classId !== undefined ||
      validated.streamId !== undefined;
    if (movingScope && existing.status !== "DRAFT") {
      return errorResponse(
        "Only draft sheets can be moved to another term, class or stream",
        400,
      );
    }

    const termId = validated.termId ?? existing.termId;
    const classId = validated.classId ?? existing.classId;
    const streamId =
      validated.streamId === undefined ? existing.streamId : validated.streamId;

    if (movingScope) {
      const [term, schoolClass, stream] = await Promise.all([
        prisma.schoolTerm.findFirst({ where: { id: termId, companyId }, select: { id: true } }),
        prisma.schoolClass.findFirst({ where: { id: classId, companyId }, select: { id: true } }),
        streamId
          ? prisma.schoolStream.findFirst({
              where: { id: streamId, companyId },
              select: { id: true, classId: true },
            })
          : Promise.resolve(null),
      ]);
      if (!term) return errorResponse("Invalid term for this company", 400);
      if (!schoolClass) return errorResponse("Invalid class for this company", 400);
      if (streamId && !stream) return errorResponse("Invalid stream for this company", 400);
      if (stream && stream.classId !== classId) {
        return errorResponse("Stream does not belong to the selected class", 400);
      }
    }

    if (!isPrivilegedRole(session.user.role)) {
      const hasAccess = await canTeacherAccessResultSheet(companyId, session.user.id, {
        termId: existing.termId,
        classId: existing.classId,
        streamId: existing.streamId,
      });
      if (!hasAccess) {
        return errorResponse("You are not assigned to this class/stream result sheet", 403);
      }
    }

    const updated = await prisma.schoolResultSheet.update({
      where: { id },
      data: {
        ...(validated.title !== undefined ? { title: validated.title } : {}),
        ...(movingScope ? { termId, classId, streamId } : {}),
      },
      include: sheetInclude,
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/v2/schools/results/sheets/[id] error:", error);
    return errorResponse("Failed to update result sheet");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.results", "archive");
    if (denied) return errorResponse(denied, 403);
    const { id } = await params;

    const existing = await prisma.schoolResultSheet.findUnique({
      where: { id },
      select: { id: true, companyId: true, status: true },
    });
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Result sheet not found", 404);
    }
    // Once a head of department has signed a sheet off, deleting it would take
    // the moderation trail with it. Send it back first; that is the undo.
    if (existing.status !== "DRAFT" && existing.status !== "HOD_REJECTED") {
      return errorResponse(
        "Only draft or sent-back result sheets can be deleted",
        400,
      );
    }

    await prisma.schoolResultSheet.delete({ where: { id } });

    return successResponse({ id });
  } catch (error) {
    console.error("[API] DELETE /api/v2/schools/results/sheets/[id] error:", error);
    return errorResponse("Failed to delete result sheet");
  }
}
