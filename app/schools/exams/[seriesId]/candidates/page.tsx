import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ExamCandidatesContent } from "@/components/schools/exams/exam-candidates-content";
import { authOptions } from "@/lib/auth";

/** Candidates — S-13.1. The roll, and what is stopping an entry. */
export default async function SchoolsExamCandidatesPage({
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
      <ExamCandidatesContent seriesId={seriesId} />
    </div>
  );
}
