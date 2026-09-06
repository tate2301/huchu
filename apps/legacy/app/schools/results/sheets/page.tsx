import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { MarkSheetsContent } from "@/components/schools/results/mark-sheets-content";
import { authOptions } from "@/lib/auth";

/**
 * "Result sheets" in the sidebar pointed here, this route redirected to
 * `/schools/assessments`, and `app/schools/assessments` was never written — so
 * the nav item was a 404 in the shipped product. The href stays; the page is
 * now real.
 */
export default async function SchoolsResultSheetsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <MarkSheetsContent />
    </div>
  );
}
