import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { SchoolsAttendanceContent } from "@/components/schools/attendance/schools-attendance-content";
import { authOptions } from "@/lib/auth";

export default async function SchoolsAttendancePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="Attendance"
        description="Daily attendance roster and class-level register visibility."
      />
      <SchoolsAttendanceContent />
    </div>
  );
}
