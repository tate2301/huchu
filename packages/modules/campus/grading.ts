/**
 * Turning marks into a grade, with no database behind it.
 *
 * Pure by design and separate from `assessments.ts` for the reason
 * `calendar-kinds.ts` is separate from `calendar.ts`: the mark-entry screen
 * shows a live grade as a teacher types, and importing one function from a
 * module that imports Prisma pulls `pg` into the browser bundle.
 */

export type GradingBand = {
  grade: string;
  /** Inclusive. */
  minScore: number;
  /** Inclusive. */
  maxScore: number;
  points?: number | null;
  remark?: string | null;
};

export type GradingScheme = {
  continuousWeight: number;
  examWeight: number;
  passMark: number;
  bands: GradingBand[];
};

/**
 * The grade for a mark, or null when no band covers it.
 *
 * Null rather than a fallback grade: a scheme with a hole in it should show as
 * a missing grade on one report card, which somebody fixes, rather than as a U
 * on every report card, which nobody questions.
 */
export function gradeFor(bands: GradingBand[], mark: number): GradingBand | null {
  for (const band of bands) {
    if (mark >= band.minScore && mark <= band.maxScore) return band;
  }
  return null;
}

export type BandProblem = { message: string };

/**
 * Whether a set of bands can grade every mark exactly once.
 *
 * This is a check in code rather than a database constraint, and deliberately.
 * Postgres can express it — an `EXCLUDE USING gist` over `numrange` — but only
 * with the `btree_gist` extension, and requiring an extension at migration
 * time raises the cost of a failed deploy above the cost of the bug. Bands are
 * written through one route, which calls this. See
 * `docs/expansion-plan/schools-open-questions.md`.
 */
export function findBandProblems(bands: GradingBand[]): BandProblem[] {
  const problems: BandProblem[] = [];

  for (const band of bands) {
    if (band.minScore > band.maxScore) {
      problems.push({
        message: `${band.grade} runs from ${band.minScore} down to ${band.maxScore}`,
      });
    }
    if (band.minScore < 0 || band.maxScore > 100) {
      problems.push({ message: `${band.grade} falls outside 0-100` });
    }
  }

  const sorted = [...bands].sort((a, b) => a.minScore - b.minScore);
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (current.minScore <= previous.maxScore) {
      problems.push({
        message: `${previous.grade} and ${current.grade} both cover ${current.minScore}`,
      });
    }
  }

  // A gap is a mark with no grade. Reported, not rejected — a school part-way
  // through entering its table has gaps, and refusing to save would mean
  // entering the whole table in one sitting or not at all.
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (current.minScore > previous.maxScore + 0.01) {
      problems.push({
        message: `nothing covers ${previous.maxScore} to ${current.minScore}`,
      });
    }
  }

  return problems;
}

export type ScoredAssessment = {
  kind: "CONTINUOUS" | "EXAM" | "PRACTICAL";
  /** Marks available. Always greater than zero — the database enforces it. */
  maxScore: number;
  /** Relative weight within its side of the scheme. */
  weight: number;
  /** Null when unmarked or absent; both are excluded from the average. */
  score: number | null;
};

export type TermMark = {
  /** 0-100, or null when nothing has been marked. */
  mark: number | null;
  /** The continuous side as a percentage, or null when there is none. */
  continuous: number | null;
  /** The exam side as a percentage, or null when there is none. */
  exam: number | null;
  grade: GradingBand | null;
  /** What the caller should tell the reader when the answer is partial. */
  caveat: string | null;
};

function weightedPercentage(entries: ScoredAssessment[]) {
  let weighted = 0;
  let weight = 0;
  for (const entry of entries) {
    if (entry.score === null) continue;
    weighted += (entry.score / entry.maxScore) * 100 * entry.weight;
    weight += entry.weight;
  }
  return weight === 0 ? null : weighted / weight;
}

/**
 * One subject's term mark.
 *
 * Practicals count on the continuous side. They are a separate kind so a report
 * can print them separately, not because they are weighted separately — a
 * school that wants a third weight is asking for a different scheme shape, and
 * inventing one now would be guessing.
 *
 * An unmarked or absent assessment is left out of its average rather than
 * counted as zero. A child off sick for one of three tests should not have that
 * term's mark cut by a third; if a school wants absences to score zero, that is
 * a policy switch we have not been asked for.
 *
 * When only one side exists the mark is that side, whole. Scaling 100 per cent
 * of the continuous work by a 30 per cent weight would report a child who has
 * done every piece of work set as having scored 30 — which is what happens if
 * you apply the weights before checking both sides are there.
 */
export function computeTermMark(
  assessments: ScoredAssessment[],
  scheme: Pick<GradingScheme, "continuousWeight" | "examWeight"> & {
    bands: GradingBand[];
  },
): TermMark {
  const continuous = weightedPercentage(
    assessments.filter((entry) => entry.kind !== "EXAM"),
  );
  const exam = weightedPercentage(
    assessments.filter((entry) => entry.kind === "EXAM"),
  );

  let mark: number | null;
  let caveat: string | null = null;

  if (continuous === null && exam === null) {
    mark = null;
    caveat = assessments.length === 0 ? "No assessments set" : "Nothing marked yet";
  } else if (exam === null) {
    mark = continuous;
    caveat = "Continuous work only — no exam mark yet";
  } else if (continuous === null) {
    mark = exam;
    caveat = "Exam only — no continuous work recorded";
  } else {
    mark =
      (continuous * scheme.continuousWeight + exam * scheme.examWeight) / 100;
  }

  const rounded = mark === null ? null : Math.round(mark * 100) / 100;

  return {
    mark: rounded,
    continuous: continuous === null ? null : Math.round(continuous * 100) / 100,
    exam: exam === null ? null : Math.round(exam * 100) / 100,
    grade: rounded === null ? null : gradeFor(scheme.bands, rounded),
    caveat,
  };
}

/**
 * The scheme a school starts with: 30/70, A to U, pass at 50.
 *
 * Zimbabwean secondary practice, and a starting point rather than a rule — the
 * whole point of the model is that a school edits it.
 */
export const DEFAULT_GRADING_BANDS: GradingBand[] = [
  { grade: "A", minScore: 75, maxScore: 100, points: 1, remark: "Excellent" },
  { grade: "B", minScore: 65, maxScore: 74.99, points: 2, remark: "Very good" },
  { grade: "C", minScore: 50, maxScore: 64.99, points: 3, remark: "Good" },
  { grade: "D", minScore: 40, maxScore: 49.99, points: 4, remark: "Below standard" },
  { grade: "E", minScore: 30, maxScore: 39.99, points: 5, remark: "Weak" },
  { grade: "U", minScore: 0, maxScore: 29.99, points: 9, remark: "Ungraded" },
];
