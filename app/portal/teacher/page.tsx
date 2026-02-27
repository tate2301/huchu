import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { TeacherPortalContent } from "@/components/schools/portal/teacher-portal-content";
import { authOptions } from "@/lib/auth";

export default async function TeacherPortalPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="Teacher Portal"
        description="Moderation queue, sheet progress, and published result visibility."
      />
      <TeacherPortalContent />
    </div>
  );
}
