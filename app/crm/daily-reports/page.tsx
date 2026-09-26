import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { DailyReportsContent } from "@/components/crm/money/daily-reports-content";
import { authOptions } from "@/lib/auth";

/**
 * What everybody did, day by day.
 *
 * These arrive on their own as people close their days — nobody chases them,
 * and nobody writes them twice.
 */
export default async function CrmDailyReportsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return (
    <CrmPage title="Daily reports">
      <DailyReportsContent />
    </CrmPage>
  );
}
