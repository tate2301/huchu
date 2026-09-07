import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";
import { PageHeading } from "@corelithzw/ui/layout/page-heading";
import { SchoolsReportsEnhancedContent } from "../../../components/reports/schools-reports-enhanced-content";

export default async function SchoolsReportsPage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="School Reports"
        description="What the school has billed and collected, who is behind and by how long, how many are on the roll and how full the hostels are — each of them narrowable, and exportable as it stands."
      />
      <SchoolsReportsEnhancedContent />
    </div>
  );
}

