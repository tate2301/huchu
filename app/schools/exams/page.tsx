import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ExamSeriesContent } from "@/components/schools/exams/exam-series-content";
import { authOptions } from "@/lib/auth";

/**
 * Exam series — S-13.1.
 *
 * Gated on `schools.exams`, which is a paid add-on with its own feature key.
 * Without the route-registry row this prefix would fall through to the
 * `/schools` catch-all and resolve to `schools.core`, which gives the add-on
 * away to every tenant.
 */
export default async function SchoolsExamsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <ExamSeriesContent />
    </div>
  );
}
