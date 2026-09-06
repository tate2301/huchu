import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { getCurrentTerm } from "@/lib/schools/calendar";
import { resolvePortalStudent } from "@/lib/schools/portal-identity";

const querySchema = z.object({
  termId: z.string().uuid().optional(),
});

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole days between now and a deadline, negative once it has passed.
 *
 * Decided here rather than on the phone. A deadline belongs to the school, and
 * a device with the wrong date — or simply a different timezone from the
 * server that rendered the page — would otherwise disagree with the teacher
 * about whether the work is late, and disagree with the server that renders
 * the first paint about what to show.
 */
function daysUntil(dueAt: Date | null, now: Date) {
  if (!dueAt) return null;
  return Math.ceil((dueAt.getTime() - now.getTime()) / DAY_MS);
}

/**
 * The homework one pupil has been set, with their own answer against it.
 *
 * `/api/v2/schools/assignments` already lists homework, and it is the wrong
 * route for a child three times over. It is gated on `schools.academics` view,
 * which a pupil does not hold; it takes a `classId` from the caller, which is
 * the parameter S-0.2 exists to refuse; and it counts submissions rather than
 * saying whether *this* child handed in — which is the only thing they opened
 * the app to find out.
 *
 * So the class comes from the pupil's own record and the submission is theirs
 * by construction. Drafts are excluded: until a teacher publishes, the work
 * does not exist as far as the class is concerned.
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

    const resolution = await resolvePortalStudent(
      { companyId, userId: session.user.id, role: session.user.role },
      {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          currentClassId: true,
          currentStreamId: true,
        },
      },
    );
    const student = resolution.subject;
    if (!student) return errorResponse("You are not a student here", 403);

    const term = query.termId
      ? await prisma.schoolTerm.findFirst({
          where: { id: query.termId, companyId },
          select: { id: true, code: true, name: true },
        })
      : await getCurrentTerm(companyId);
    if (!term) return errorResponse("This school has no active term", 400);

    // A pupil with no class has no homework rather than everybody's homework.
    if (!student.currentClassId) {
      return successResponse({ term, assignments: [] });
    }

    const assignments = await prisma.schoolAssignment.findMany({
      where: {
        companyId,
        termId: term.id,
        isPublished: true,
        classSubject: {
          classId: student.currentClassId,
          // A class subject with no stream is taught to the whole year group;
          // one with a stream is taught to that stream only. Both are this
          // child's work, and nobody else's stream is.
          ...(student.currentStreamId
            ? { OR: [{ streamId: null }, { streamId: student.currentStreamId }] }
            : { streamId: null }),
        },
      },
      select: {
        id: true,
        title: true,
        instructions: true,
        dueAt: true,
        maxScore: true,
        publishedAt: true,
        classSubject: {
          select: {
            id: true,
            subject: { select: { id: true, code: true, name: true } },
            class: { select: { id: true, name: true } },
            stream: { select: { id: true, name: true } },
            teacherProfile: { select: { user: { select: { name: true } } } },
          },
        },
      },
      // Soonest deadline first: "what is due" is the question, and work with no
      // deadline sits at the end where it belongs.
      orderBy: [{ dueAt: "asc" }, { publishedAt: "desc" }],
      take: 200,
    });

    const submissions = await prisma.schoolAssignmentSubmission.findMany({
      where: {
        companyId,
        studentId: student.id,
        assignmentId: { in: assignments.map((row) => row.id) },
      },
      select: {
        id: true,
        assignmentId: true,
        status: true,
        submittedAt: true,
        content: true,
        attachmentUrl: true,
        score: true,
        feedback: true,
        markedAt: true,
      },
    });
    const mine = new Map(submissions.map((row) => [row.assignmentId, row]));
    const now = new Date();

    return successResponse({
      term,
      assignments: assignments.map((row) => {
        const submission = mine.get(row.id) ?? null;
        return {
          id: row.id,
          title: row.title,
          instructions: row.instructions,
          dueAt: row.dueAt,
          dueInDays: daysUntil(row.dueAt, now),
          isOverdue: row.dueAt !== null && row.dueAt.getTime() < now.getTime(),
          maxScore: row.maxScore,
          setOn: row.publishedAt,
          subjectId: row.classSubject.subject.id,
          subjectCode: row.classSubject.subject.code,
          subjectName: row.classSubject.subject.name,
          className: row.classSubject.class.name,
          streamName: row.classSubject.stream?.name ?? null,
          teacherName: row.classSubject.teacherProfile?.user?.name ?? null,
          submission: submission
            ? {
                id: submission.id,
                status: submission.status,
                submittedAt: submission.submittedAt,
                content: submission.content,
                attachmentUrl: submission.attachmentUrl,
                score: submission.score,
                feedback: submission.feedback,
                markedAt: submission.markedAt,
              }
            : null,
        };
      }),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/portal/student/me/homework error:", error);
    return errorResponse("Failed to fetch your homework");
  }
}
