import { prisma } from "@/lib/prisma";


/**
 * Which marks a child and their family are allowed to see.
 *
 * A score becomes a fact about a child only once the school has released it.
 * Before that it is a draft a teacher may still correct, a submission an HOD may
 * send back, or an outright rejection — and a mark seen and then corrected is a
 * conversation with a child about a grade that never was.
 *
 * Three screens ask "where is this child now": the pupil's subject list, their
 * goals, and the head's goals oversight. Each asked the database itself, and a
 * missing status filter on any one of them put an unmoderated mark in front of a
 * child. They ask here instead, so the gate cannot be present in two places and
 * absent in the third.
 */

/** The key `publishedMarksForTerm` files each mark under. */
export function markKey(studentId: string, subjectCode: string) {
  return `${studentId}:${subjectCode}`;
}

/**
 * The released marks these pupils hold this term, by pupil and subject code.
 *
 * Subject *code* rather than subject id because a result line carries the code
 * the sheet was typed against and nothing else — sheets are entered per class,
 * not per class-subject row.
 */
export async function publishedMarksForTerm(input: {
  companyId: string;
  termId: string;
  studentIds: string[];
}): Promise<Map<string, number>> {
  if (input.studentIds.length === 0) return new Map();

  const lines = await prisma.schoolResultLine.findMany({
    where: {
      companyId: input.companyId,
      studentId: { in: input.studentIds },
      sheet: { termId: input.termId, status: "PUBLISHED" },
    },
    select: { studentId: true, subjectCode: true, score: true },
    take: 8000,
  });

  return new Map(
    lines.map((line) => [markKey(line.studentId, line.subjectCode), line.score]),
  );
}
