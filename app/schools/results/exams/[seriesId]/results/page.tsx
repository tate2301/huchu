import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ExamResultsContent } from "@/components/schools/exams/exam-results-content";
import { authOptions } from "@/lib/auth";

/** Public results — S-13.2. A grade with no score. */
export default async function SchoolsExamResultsPage({
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
      <ExamResultsContent seriesId={seriesId} />
    </div>
  );
}
