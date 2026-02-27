import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { SchoolsResultsContent } from "@/components/schools/results/schools-results-content";
import { authOptions } from "@/lib/auth";

export default async function SchoolsResultsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="Schools Results"
        description="Moderation workflow and publish-readiness visibility."
      />
      <SchoolsResultsContent />
    </div>
  );
}
