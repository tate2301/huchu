import { SchemeOfWorkContent } from "@/components/schools/portal/teacher/scheme-of-work-content";

/**
 * A subject's term, week by week — the document "lay out this week" drafts from.
 *
 * It lived on the administrator's Academics page, where the people who
 * actually write a scheme of work could not reach it. It belongs here.
 */
export default function TeacherSyllabusPage() {
  return <SchemeOfWorkContent />;
}
