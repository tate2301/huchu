import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { CostTrackerContent } from "@/components/crm/money/cost-tracker-content";
import { authOptions } from "@/lib/auth";

/**
 * Money in and out of people's hands, a line at a time.
 *
 * Closing the day here is what sends somebody's report to management, rather
 * than a second action on a second page that they would have to remember.
 */
export default async function CrmCostTrackerPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return (
    <CrmPage title="Cost tracker" description="what came in, what went out, and on what">
      <CostTrackerContent />
    </CrmPage>
  );
}
