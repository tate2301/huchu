import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { SchoolsAdmissionsContent } from "@/components/schools/admissions/schools-admissions-content";
import { authOptions } from "@/lib/auth";

export default async function SchoolsAdmissionsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="Admissions"
        description="Enrollment pipeline and class placement tracking."
      />
      <SchoolsAdmissionsContent />
    </div>
  );
}
