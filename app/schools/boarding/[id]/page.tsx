import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { SchoolsHostelDetailContent } from "@/components/schools/boarding/schools-hostel-detail-content";
import { authOptions } from "@/lib/auth";

export default async function HostelDetailPage({
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
      <PageHeading
        title="Hostel Details"
        description="Rooms, beds, allocations, and leave requests."
      />
      <SchoolsHostelDetailContent hostelId={id} />
    </div>
  );
}
