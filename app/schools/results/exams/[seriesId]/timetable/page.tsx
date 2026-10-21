import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ExamTimetableContent } from "@/components/schools/exams/exam-timetable-content";
import { authOptions } from "@/lib/auth";

/**
 * The papers this series sits, and when.
 *
 * The write path Seating was missing: `SchoolExamPaper` and
 * `SchoolExamSession` were read by the seating plan and created by nothing, so
 * every school met "this series has no sittings yet" with nowhere to go.
 */
export default async function SchoolsExamTimetablePage({
  params,
}: {
  params: Promise<{ seriesId: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const { seriesId } = await params;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <ExamTimetableContent seriesId={seriesId} />
    </div>
  );
}
