import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ExamSeatingContent } from "@/components/schools/exams/exam-seating-content";
import { authOptions } from "@/lib/auth";

/** Seating and invigilation — S-13.1, one session at a time. */
export default async function SchoolsExamSeatingPage({
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
      <ExamSeatingContent seriesId={seriesId} />
    </div>
  );
}
