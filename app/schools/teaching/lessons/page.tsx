import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { PageHeading } from "@/components/layout/page-heading";
import { LessonPlansPageContent } from "@/components/schools/timetable/lesson-plans-page-content";
import { authOptions } from "@/lib/auth";

/**
 * The office's lesson planner: every assignment in the school, not one
 * teacher's.
 *
 * The component was built and imported by nobody — the only planner anybody
 * could reach was the teacher portal's, which is scoped to the signed-in
 * teacher. That is the wrong half for an office arranging cover, which is the
 * one job here a teacher cannot do for herself.
 */
export default async function SchoolsLessonPlansPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading title="Lesson plans" />
      <LessonPlansPageContent />
    </div>
  );
}
