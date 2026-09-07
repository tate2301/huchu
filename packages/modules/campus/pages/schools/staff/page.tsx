import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";

import { SchoolStaffContent } from "../../../components/staff/school-staff-content";

/**
 * Everybody a school employs who does not teach.
 *
 * They are HR employees filtered to this school, not a staff list of their own
 * — one payroll, one leave ledger, one record per person. The teaching register
 * next door answers a different question and holds different columns.
 */
export default async function SchoolsStaffPage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <SchoolStaffContent />
    </div>
  );
}
