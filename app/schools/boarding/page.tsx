import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { SchoolsBoardingContent } from "@/components/schools/boarding/schools-boarding-content";
import { authOptions } from "@/lib/auth";

export default async function SchoolsBoardingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="Boarding Management"
        description="Hostels, allocations, leave workflow, and occupancy oversight."
      />
      <SchoolsBoardingContent />
    </div>
  );
}
