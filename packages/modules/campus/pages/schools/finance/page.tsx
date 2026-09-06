import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";

import { PageHeading } from "@corelithzw/ui/layout/page-heading";
import { FeesGradePicker } from "../../../components/fees/fees-grade-picker";

/**
 * Fees start with "whose fees?" — S-4.6, the same shape students, attendance and
 * results already have. The year group is the route; the ledger it used to open
 * with lives at `/schools/finance/ledger`.
 */
export default async function SchoolsFinancePage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading title="Fees and finance" />
      <FeesGradePicker />
    </div>
  );
}
