import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { SchoolsClassDetailContent } from "@/components/schools/classes/schools-class-detail-content";
import { authOptions } from "@/lib/auth";

export default async function SchoolsClassDetailPage({
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
      <PageHeading title="Class Details" description="View class students, streams and subjects." />
      <SchoolsClassDetailContent classId={id} />
    </div>
  );
}
