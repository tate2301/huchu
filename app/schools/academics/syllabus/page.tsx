import { redirect } from "next/navigation";

/**
 * The scheme of work moved to the teacher portal.
 *
 * It is a teacher's document — it is what "lay out this week" drafts from —
 * and it sat in the administrator's Academics page, where the people who write
 * it could not reach it.
 */
export default function SchoolsSyllabusPage() {
  redirect("/portal/teacher/syllabus");
}
