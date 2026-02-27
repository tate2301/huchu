import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { StudentPortalContent } from "@/components/schools/portal/student-portal-content";
import { authOptions } from "@/lib/auth";

export default async function StudentPortalPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="Student Portal"
        description="Enrollment, published results, guardians, and boarding visibility."
      />
      <StudentPortalContent />
    </div>
  );
}
