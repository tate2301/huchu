import { fetchJson } from "@/lib/api-client";

/**
 * Subject targets, from the browser's side.
 *
 * The goals screens had nothing here and reached for `fetchJson` in the
 * component, which was survivable while every write was the same POST. It stops
 * being survivable the moment there are two verbs that look alike and mean
 * different things — set a target where there is none, and correct one that is
 * already on the board — because a component assembling its own body is one
 * keystroke from sending the second as the first and leaving a duplicate.
 *
 * As everywhere in this module, `successResponse` does not wrap: this reads the
 * body directly rather than reaching for `.data.data`.
 */

export type StudentGoalWritten = {
  id: string;
  termId: string;
  subjectId: string;
  targetMark: number | null;
  baselineMark: number | null;
};

/**
 * Change a target that already exists, by its own id.
 *
 * Every field is optional and only what is sent is written, so a caller
 * correcting the number alone leaves the plan and the teacher's note where they
 * are. `null` is the other half of that: it means rub this one out, which is
 * how an emptied box on the form reaches the column.
 *
 * `subjectId` and `termId` move the target rather than copying it — the fix for
 * a target recorded against the wrong subject, or set into last term by a head
 * of department who had not changed the filter.
 */
export function updateStudentGoal(input: {
  id: string;
  termId?: string;
  subjectId?: string;
  targetMark?: number | null;
  plan?: string | null;
  baselineMark?: number | null;
  teacherNote?: string | null;
}) {
  return fetchJson<StudentGoalWritten>("/api/v2/schools/goals", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
