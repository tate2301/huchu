import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ReportsArrearsContent } from "@corelithzw/module-campus/components/reports/reports-arrears-content";
import { authOptions } from "@/lib/auth";

/**
 * Arrears and ageing, on a route of its own.
 *
 * No `PageHeading`: the title and the one primary action are registered with
 * the top app bar from inside the content component, because "Remind the N"
 * is gated on the signed-in person's grants and its count is whatever the
 * filters left on screen — neither of which a server component can answer.
 */
export default async function SchoolsArrearsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <ReportsArrearsContent />
    </div>
  );
}
