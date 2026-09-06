import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { PageHeading } from "@/components/layout/page-heading";
import { FeesGradePicker } from "@/components/schools/fees/fees-grade-picker";
import { authOptions } from "@/lib/auth";

/**
 * Fees start with "whose fees?" — S-4.6, the same shape students, attendance and
 * results already have. The year group is the route; the ledger it used to open
 * with lives at `/schools/finance/ledger`.
 */
export default async function SchoolsFinancePage() {
  const session = await getServerSession(authOptions);
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
