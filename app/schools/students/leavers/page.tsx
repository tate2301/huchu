import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { LeaversContent } from "@/components/schools/leavers/leavers-content";
import { authOptions } from "@/lib/auth";

/**
 * Leavers — S-13.4.
 *
 * Where graduating leads. `applyYearRollUp` has always changed a pupil's
 * status; this is the five marks a school checks before the record closes.
 */
export default async function SchoolsLeaversPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <LeaversContent />
    </div>
  );
}
