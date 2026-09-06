import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@corelithzw/ui/layout/page-heading";
import { SchoolsReportsEnhancedContent } from "@corelithzw/module-campus/components/reports/schools-reports-enhanced-content";
import { authOptions } from "@/lib/auth";

export default async function SchoolsReportsPage() {
  const session = await getServerSession(authOptions);
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

