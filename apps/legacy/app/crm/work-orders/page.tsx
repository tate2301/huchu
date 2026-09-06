import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { WorkOrdersContent } from "@/components/crm/work-orders/work-orders-content";
import { authOptions } from "@/lib/auth";

/**
 * The jobs register.
 *
 * No `PageChrome` here any more: `RecordListShell` registers the page's name
 * and its create button with the app bar itself, the same as every other CRM
 * list, and a second title above it was a band of page spent repeating what
 * the bar already said.
 */
export default async function CrmWorkOrdersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  return (
    <CrmPage>
      <WorkOrdersContent />
    </CrmPage>
  );
}
