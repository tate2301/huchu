import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { SchoolsTimetableContent } from "@/components/schools/timetable/schools-timetable-content";
import { authOptions } from "@/lib/auth";

export default async function SchoolsTimetablePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="Timetable"
        description="Teaching allocation timetable by class, stream, and subject."
      />
      <SchoolsTimetableContent />
    </div>
  );
}

