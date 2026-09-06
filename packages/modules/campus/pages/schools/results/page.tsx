import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";
import { ResultsOverviewContent } from "../../../components/results/results-overview-content";

/**
 * Results opened on a grid of year-group cards — a picker where a page should
 * be. Anybody who opens Results is asking what is outstanding and whether the
 * school can publish yet, and a picker answers neither. The class ladder is
 * still one click away, from the class name on every row.
 */
export default async function SchoolsResultsPage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <ResultsOverviewContent />
    </div>
  );
}
