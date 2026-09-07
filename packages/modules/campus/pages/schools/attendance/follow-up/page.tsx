import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";

import { AbsenceFollowUpContent } from "../../../../components/attendance/absence-follow-up-content";

/**
 * Who has been away, and who has not been rung about it.
 *
 * The register board answers which classes have not sent a register in; this is
 * the question that comes after, and a different person asks it at a different
 * time of day.
 */
export default async function SchoolsAbsenceFollowUpPage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <AbsenceFollowUpContent />
    </div>
  );
}
