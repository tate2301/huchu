import { accentFor, type AccentHue } from "@corelithzw/react";
import type { TeacherClass } from "./teacher-portal-context";

/**
 * The hue a subject wears across the whole teacher portal.
 *
 * One teacher teaches two or three subjects, so the portal draws from a short
 * rotation rather than from the full accent wheel: a rail of six classes then
 * reads as "two subjects, three forms each" instead of as six unrelated
 * colours. That is what the prototype's violet/blue pair does, and the colour
 * has to agree between the class rail and the timetable grid or the two stop
 * describing the same thing.
 *
 * The mapping is derived from the teacher's own class list — first subject
 * takes the first hue — so it is stable for a given teacher without anything
 * being stored. A subject that is not one of theirs (a cover lesson, another
 * department's file) falls back to the design system's hash, which is stable
 * for a different reason: it depends only on the name.
 */
const SUBJECT_CYCLE = ["violet", "blue", "teal", "amber", "pink", "green"] as const;

export function subjectHues(classes: Pick<TeacherClass, "subjectName">[]) {
  const subjects = [...new Set(classes.map((row) => row.subjectName))];
  return new Map<string, AccentHue>(
    subjects.map((subject, index) => [
      subject,
      SUBJECT_CYCLE[index % SUBJECT_CYCLE.length],
    ]),
  );
}

export function hueFor(hues: Map<string, AccentHue>, subject: string | null | undefined) {
  return (subject ? hues.get(subject) : undefined) ?? accentFor(subject);
}
