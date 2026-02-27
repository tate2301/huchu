import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { SchoolsSubjectsContent } from "@/components/schools/subjects/schools-subjects-content";
import { authOptions } from "@/lib/auth";

export default async function SchoolsSubjectsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading title="Subjects" description="Manage school subjects." />
      <SchoolsSubjectsContent />
    </div>
  );
}
