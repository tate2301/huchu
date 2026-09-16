import { fetchJson } from "@/lib/api-client";

/**
 * The planner, from the browser's side.
 *
 * Correcting a plan goes through here rather than through the `save` action the
 * screen uses to write a new one. The difference is the whole point: `save`
 * rebuilds the row out of the body, and the dialog does not carry every column
 * — so a teacher opening a scheme-seeded draft to fix a word in the topic was
 * rewriting the resources note to nothing on the way past. A correction sends
 * the fields it changed and nothing else.
 *
 * A note that is genuinely being rubbed out is sent as `null`, which is not the
 * same as leaving it out, and the type below keeps that difference visible to a
 * component rather than letting an empty string stand in for either.
 */
export type LessonPlanCorrection = {
  /** YYYY-MM-DD. The day it was actually taught. */
  lessonDate?: string;
  topic?: string;
  objectives?: string | null;
  activities?: string | null;
  resourcesNote?: string | null;
  homeworkNote?: string | null;
  /** What happened, written after the bell. Null takes it back off the plan. */
  reflection?: string | null;
};

export function correctLessonPlan(id: string, changes: LessonPlanCorrection) {
  return fetchJson<{ id: string; lessonDate: string; topic: string }>(
    `/api/v2/schools/lesson-plans/${id}`,
    { method: "PATCH", body: JSON.stringify(changes) },
  );
}
