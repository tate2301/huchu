import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { MyDayContent } from "@/components/crm/money/my-day-content";
import { authOptions } from "@/lib/auth";

/**
 * One person's money for one day.
 *
 * Closing the day here is what sends their report to management, rather than
 * a second action on a second page that somebody would have to remember.
 */
export default async function CrmMyDayPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return (
    <CrmPage title="My day" description="what you were given, and what you spent">
      <MyDayContent />
    </CrmPage>
  );
}
