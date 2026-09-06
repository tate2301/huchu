import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { TeacherAssignmentsContent } from "@corelithzw/module-campus/components/teachers/teacher-assignments-content";
import { authOptions } from "@/lib/auth";

/**
 * Who teaches what, across the whole school.
 *
 * The teacher record answers this one teacher at a time, which is the wrong
 * shape for the question a timetable is built from — which class has a subject
 * with nobody against it.
 */
export default async function SchoolsTeacherAssignmentsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <TeacherAssignmentsContent />
    </div>
  );
}
