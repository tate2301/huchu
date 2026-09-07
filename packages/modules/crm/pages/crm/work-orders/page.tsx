import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";

import { CrmPage } from "../../../components/crm-page";
import { WorkOrdersContent } from "../../../components/work-orders/work-orders-content";

/**
 * The jobs register.
 *
 * No `PageChrome` here any more: `RecordListShell` registers the page's name
 * and its create button with the app bar itself, the same as every other CRM
 * list, and a second title above it was a band of page spent repeating what
 * the bar already said.
 */
export default async function CrmWorkOrdersPage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) redirect("/login");
  return (
    <CrmPage>
      <WorkOrdersContent />
    </CrmPage>
  );
}
