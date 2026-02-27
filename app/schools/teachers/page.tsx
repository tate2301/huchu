import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { SchoolsTeachersContent } from "@/components/schools/teachers/schools-teachers-content";
import { authOptions } from "@/lib/auth";

export default async function SchoolsTeachersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="Teachers"
        description="Teacher profiles, subjects, and assignment governance."
      />
      <SchoolsTeachersContent />
    </div>
  );
}
