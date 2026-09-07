import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";

import { TeacherAssignmentsContent } from "../../../../components/teachers/teacher-assignments-content";

/**
 * Who teaches what, across the whole school.
 *
 * The teacher record answers this one teacher at a time, which is the wrong
 * shape for the question a timetable is built from — which class has a subject
 * with nobody against it.
 */
export default async function SchoolsTeacherAssignmentsPage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <TeacherAssignmentsContent />
    </div>
  );
}
