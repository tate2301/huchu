import { prisma } from "@/lib/prisma";

import { findOpenPublishWindow } from "./governance-v2";

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

/** The part of a mark's sheet that decides whether a publish window covers it. */
export type WindowedMark = {
  sheet: { termId: string; classId: string; streamId: string | null };
};

/**
 * Drop marks whose publish window is shut.
 *
 * PUBLISHED and "released to families" are not the same thing. S-1.3 lets a
 * school schedule when results may be seen, so a sheet can be published days
 * before its window opens, and a window closes while the sheet stays published
 * for the office's own use. The report card has always honoured both; the marks
 * JSON honoured only the status, which meant a family could read in the app a
 * mark the PDF refused to print.
 *
 * Windows are looked up per distinct sheet scope rather than per mark: a child
 * has one sheet per term per class, so this is a handful of queries even across
 * a whole school career, and it keeps the matching rule in
 * `findOpenPublishWindow` where the publishing screens already read it.
 */
export async function keepMarksInOpenWindows<T extends WindowedMark>(
  companyId: string,
  marks: T[],
  at = new Date(),
): Promise<T[]> {
  const scopes = new Map<string, T["sheet"]>();
  for (const mark of marks) {
    scopes.set(
      `${mark.sheet.termId}:${mark.sheet.classId}:${mark.sheet.streamId ?? ""}`,
      mark.sheet,
    );
  }
  if (scopes.size === 0) return [];

  const open = new Set<string>();
  await Promise.all(
    Array.from(scopes, async ([key, sheet]) => {
      const window = await findOpenPublishWindow(companyId, sheet, at);
      if (window) open.add(key);
    }),
  );

  return marks.filter((mark) =>
    open.has(`${mark.sheet.termId}:${mark.sheet.classId}:${mark.sheet.streamId ?? ""}`),
  );
}
