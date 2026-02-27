import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { SchoolsStudentsContent } from "@/components/schools/students/schools-students-content";
import { authOptions } from "@/lib/auth";

export default async function SchoolsStudentsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading title="Students" description="Student and guardian directory management." />
      <SchoolsStudentsContent />
    </div>
  );
}
