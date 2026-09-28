import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ExamReferenceContent } from "@/components/schools/exams/exam-reference-content";
import { authOptions } from "@/lib/auth";

/**
 * The boards this school sits with, its centre numbers, and their syllabuses.
 *
 * `POST /api/v2/schools/exams/reference` shipped with no caller, so no school
 * could create a board — and without a board there is no series, and without a
 * series there are no candidates, entries, timetable, seating or results. The
 * whole module was unreachable from an empty tenant.
 */
export default async function ExamReferencePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <ExamReferenceContent />
    </div>
  );
}
