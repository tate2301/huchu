import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { SchoolsNoticesContent } from "@/components/schools/notices/schools-notices-content";
import { authOptions } from "@/lib/auth";

export default async function SchoolsNoticesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="School Notices"
        description="Audience-targeted notices for parents, students, and teachers."
      />
      <SchoolsNoticesContent />
    </div>
  );
}

