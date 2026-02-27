import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { StudentProfileContent } from "@/components/schools/students/student-profile-content";
import { authOptions } from "@/lib/auth";

export default async function StudentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading title="Student Profile" description="View student details and history." />
      <StudentProfileContent studentId={id} />
    </div>
  );
}
