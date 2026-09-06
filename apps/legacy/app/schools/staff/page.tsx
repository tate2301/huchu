import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { SchoolStaffContent } from "@corelithzw/module-campus/components/staff/school-staff-content";
import { authOptions } from "@/lib/auth";

/**
 * Everybody a school employs who does not teach.
 *
 * They are HR employees filtered to this school, not a staff list of their own
 * — one payroll, one leave ledger, one record per person. The teaching register
 * next door answers a different question and holds different columns.
 */
export default async function SchoolsStaffPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <SchoolStaffContent />
    </div>
  );
}
