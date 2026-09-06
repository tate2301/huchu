import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@corelithzw/ui/layout/page-heading";
import { SchoolsDashboardContent } from "@/components/schools/schools-dashboard-content";
import { authOptions } from "@/lib/auth";

/**
 * The school's morning.
 *
 * Named for what it is rather than for the software — it was "School Management
 * System", which is the product's name and not the page's, and told a head
 * teacher nothing they did not know about where they were. The state that used
 * to be missing entirely — the term, the day, how many registers are in — is on
 * the band under the title, where it changes without renaming the page.
 */
export default async function SchoolsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading title="School overview" />
      <SchoolsDashboardContent />
    </div>
  );
}
