import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { SchoolsReportsContent } from "@/components/schools/reports/schools-reports-content";
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
        description="Operational school KPIs across academics, attendance, boarding, and finance."
      />
      <SchoolsReportsContent />
    </div>
  );
}

