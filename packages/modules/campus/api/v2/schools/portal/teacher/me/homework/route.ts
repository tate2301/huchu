import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { getCurrentTerm } from "../../../../../../../calendar";
import { getTeacherProfile } from "../../../../../../../governance-v2";
import { teacherClasses } from "../../../../../../../teacher-day";

const querySchema = z.object({
  termId: z.string().uuid().optional(),
});

/**
 * The homework a teacher has set, with what has come back against it.
 *
 * `/api/v2/schools/assignments` already lists homework, but it counts only the
 * submissions that exist. The two numbers a teacher actually reads are
 * handed-in *of the roll* and marked *of what was handed in*, and neither is
 * answerable from a submission count: "nobody has handed this in" and "nobody
 * is in the class" produce the same zero, and marked is not counted at all.
 * Asking the board route once per assignment would answer it at the cost of a
 * request per row, so the counting happens here, in three queries, for the
 * caller's own classes only.
 *
 * Scoped to the teacher rather than to a class: this is the screen a teacher
 * opens to see everything they have set, across every class they teach. There
 * is no privileged bypass — the office asks its own question, on its own
 * screen, about registers and moderation.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      termId: searchParams.get("termId") ?? undefined,
    });

    const profile = await getTeacherProfile(companyId, session.user.id);
    if (!profile) {
      return errorResponse("You are not linked to a teacher profile", 403);
    }

    const term = query.termId
      ? await prisma.schoolTerm.findFirst({
          where: { id: query.termId, companyId },
          select: { id: true, code: true, name: true },
        })
      : await getCurrentTerm(companyId);
    if (!term) return errorResponse("This school has no active term", 400);

    // The roll size travels with the class, from the same helper the rail and
    // the register use, so the three surfaces cannot disagree about how many
    // children are in Form 2A.
    const classes = await teacherClasses({
      companyId,
      teacherProfileId: profile.id,
      termId: term.id,
    });
    if (classes.length === 0) {
      return successResponse({ termId: term.id, assignments: [] });
    }

    const assignments = await prisma.schoolAssignment.findMany({
      where: {
        companyId,
        termId: term.id,
        classSubjectId: { in: classes.map((row) => row.classSubjectId) },
      },
      select: {
        id: true,
        title: true,
        instructions: true,
        dueAt: true,
        maxScore: true,
        isPublished: true,
        publishedAt: true,
        classSubjectId: true,
        createdAt: true,
      },
      // Soonest deadline first, which is the order a teacher works in.
      // Postgres sorts nulls last on ascending, so homework with no deadline
      // ends up at the bottom rather than at the top.
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      take: 300,
    });

    const counts = assignments.length
      ? await prisma.schoolAssignmentSubmission.groupBy({
          by: ["assignmentId", "status"],
          where: {
            companyId,
            assignmentId: { in: assignments.map((row) => row.id) },
          },
          _count: { _all: true },
        })
      : [];

    const classBySubject = new Map(
      classes.map((row) => [row.classSubjectId, row]),
    );

    const rows = assignments.map((assignment) => {
      const taught = classBySubject.get(assignment.classSubjectId);
      const mine = counts.filter((row) => row.assignmentId === assignment.id);
      const countOf = (status: string) =>
        mine.find((row) => row.status === status)?._count._all ?? 0;
      const handedIn = mine.reduce((total, row) => total + row._count._all, 0);

      return {
        id: assignment.id,
        title: assignment.title,
        instructions: assignment.instructions,
        dueAt: assignment.dueAt,
        maxScore: assignment.maxScore,
        isPublished: assignment.isPublished,
        publishedAt: assignment.publishedAt,
        setOn: assignment.createdAt,
        classSubjectId: assignment.classSubjectId,
        classId: taught?.classId ?? null,
        className: taught?.className ?? "",
        streamName: taught?.streamName ?? null,
        subjectId: taught?.subjectId ?? null,
        subjectName: taught?.subjectName ?? "",
        /** Everybody on the class list, handed in or not. */
        roll: taught?.size ?? 0,
        handedIn,
        late: countOf("LATE"),
        // `RETURNED` only, matching `assignmentBoard`'s summary: work sent
        // back to be done again has been read, but it is not finished with.
        marked: countOf("RETURNED"),
        resubmit: countOf("RESUBMIT"),
      };
    });

    return successResponse({ termId: term.id, assignments: rows });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/portal/teacher/me/homework error:", error);
    return errorResponse("Failed to load your homework");
  }
}
