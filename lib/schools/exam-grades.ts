import type { SchoolExamLevel } from "@prisma/client";

/**
 * Public exam grades, and what counts as a pass.
 *
 * The grade sets differ by level and an implementer who assumes one set gets
 * `ExamResults` wrong in a way nobody notices until a head reads it:
 *
 *   - **Ordinary Level and IGCSE**: `A*` `A` `B` `C` `D` `E` `F` `G` `U`.
 *   - **Advanced Level**: `A` `B` `C` `D` `E` `U`. No `A*`, no `F`, no `G`.
 *
 * A pass, for the purposes every head cares about, is **C or better**. That is
 * why `C or better` is a column on the results screen and `Five or more at C`
 * is a stat, and why the rule lives here rather than in each query that counts
 * one.
 */

export const O_LEVEL_GRADES = ["A*", "A", "B", "C", "D", "E", "F", "G", "U"] as const;
export const A_LEVEL_GRADES = ["A", "B", "C", "D", "E", "U"] as const;

export function gradesFor(level: SchoolExamLevel): readonly string[] {
  return level === "A_LEVEL" ? A_LEVEL_GRADES : O_LEVEL_GRADES;
}

/** Where a grade sits, lowest number best. `U` and anything unknown sort last. */
export function gradeRank(level: SchoolExamLevel, grade: string): number {
  const set = gradesFor(level);
  const index = set.indexOf(grade.trim().toUpperCase().replace("A STAR", "A*"));
  return index === -1 ? set.length : index;
}

/** C or better. The only definition of a pass this module uses. */
export function isPass(level: SchoolExamLevel, grade: string): boolean {
  return gradeRank(level, grade) <= gradeRank(level, "C");
}

/**
 * The six bands the distribution bar collapses nine grades into.
 *
 * `A*–A`, `B`, `C`, `D–E`, `F–G`, `U`. Nine bands at the width the bar is drawn
 * is a stripe nobody can read, and "A* to C" is the sentence a head actually
 * says. **The individual statement draws the real letter, not the band** — a
 * pupil's certificate says `B`, not `B band`.
 */
export const DISTRIBUTION_BANDS = [
  { label: "A*–A", grades: ["A*", "A"] },
  { label: "B", grades: ["B"] },
  { label: "C", grades: ["C"] },
  { label: "D–E", grades: ["D", "E"] },
  { label: "F–G", grades: ["F", "G"] },
  { label: "U", grades: ["U"] },
] as const;

export function bandFor(grade: string): string {
  const normalised = grade.trim().toUpperCase();
  const band = DISTRIBUTION_BANDS.find((entry) =>
    (entry.grades as readonly string[]).includes(normalised),
  );
  return band?.label ?? "U";
}

/**
 * A Level points, the way a school totals them for university entry.
 *
 * Stored on the result rather than derived, because the scale is the board's
 * and changes; this is only the default a capture screen offers.
 */
export function defaultPointsFor(level: SchoolExamLevel, grade: string): number | null {
  if (level !== "A_LEVEL") return null;
  const scale: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, E: 1, U: 0 };
  return scale[grade.trim().toUpperCase()] ?? null;
}

export const LEVEL_LABELS: Record<SchoolExamLevel, string> = {
  O_LEVEL: "Ordinary Level",
  A_LEVEL: "Advanced Level",
  IGCSE: "IGCSE",
};

/** How many subjects a candidate may sit, and the fewest that is worth entering. */
export const SUBJECT_RULE = { minimum: 6, maximum: 9 } as const;
