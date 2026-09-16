import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ExamEntriesContent } from "@/components/schools/exams/exam-entries-content";
import { authOptions } from "@/lib/auth";

/** Subject entries — S-13.1. The file this screen builds is uploaded by a human; S-13.3 is deferred. */
export default async function SchoolsExamEntriesPage({
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
      <ExamEntriesContent seriesId={seriesId} />
    </div>
  );
}
