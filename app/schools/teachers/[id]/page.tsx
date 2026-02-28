import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { TeacherProfileContent } from "@/components/schools/teachers/teacher-profile-content";
import { authOptions } from "@/lib/auth";

export default async function TeacherProfilePage({
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
      <PageHeading title="Teacher Profile" description="View teacher details and assignments." />
      <TeacherProfileContent teacherId={id} />
    </div>
  );
}
