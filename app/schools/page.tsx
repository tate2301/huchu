import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { SchoolsDashboardContent } from "@/components/schools/schools-dashboard-content";
import { authOptions } from "@/lib/auth";

export default async function SchoolsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading title="Schools" description="Operations and portal readiness dashboard." />
      <SchoolsDashboardContent />
    </div>
  );
}
