import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { AbsenceFollowUpContent } from "@/components/schools/attendance/absence-follow-up-content";
import { authOptions } from "@/lib/auth";

/**
 * Who has been away, and who has not been rung about it.
 *
 * The register board answers which classes have not sent a register in; this is
 * the question that comes after, and a different person asks it at a different
 * time of day.
 */
export default async function SchoolsAbsenceFollowUpPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <AbsenceFollowUpContent />
    </div>
  );
}
