import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { SchoolsAssessmentsContent } from "@/components/schools/assessments/schools-assessments-content";
import { authOptions } from "@/lib/auth";

export default async function SchoolsAssessmentsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="Assessments"
        description="Continuous assessment and marksheet workflow actions."
      />
      <SchoolsAssessmentsContent />
    </div>
  );
}

