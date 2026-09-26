import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { FinanceContent } from "@/components/crm/money/finance-content";
import { PageChrome } from "@/components/layout/page-chrome";
import { authOptions } from "@/lib/auth";

/**
 * The finance overview: money in and out, and where it stands.
 *
 * Read-only. Everything on it is somebody else's list added up — the
 * requisitions, the cost tracker, the invoices — and every figure links back
 * to the list it came from.
 */
export default async function CrmFinancePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return (
    <CrmPage>
      {/* Named in the bar, once. Left to itself the bar title-cases the path
          and says "Finance" — the area, not the page, and not the word the
          sidebar uses for it. */}
      <PageChrome title="Finance overview" />
      <FinanceContent />
    </CrmPage>
  );
}
