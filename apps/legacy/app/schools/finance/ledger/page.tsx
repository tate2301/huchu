import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { SchoolsFeesContent } from "@/components/schools/fees/schools-fees-content";
import { authOptions } from "@/lib/auth";

/**
 * The whole-school ledger: structures, invoices, receipts, credits, refunds and
 * waivers.
 *
 * S-4.6 made `/schools/finance` a year-group picker, because chasing arrears is
 * work a bursar does one form at a time. This is the other half of their job —
 * "every receipt this week", "which structures are still draft" — which is not
 * about a year group at all, and forcing it through one would be worse than the
 * single list it replaced.
 *
 * The heading moved inside the client component: the primary action belongs to
 * whichever segment is open, and only the browser knows that — the tab is read
 * from `?view=`, which is also why the content sits behind a Suspense boundary.
 * `useSearchParams` opts a route into client rendering, and without the
 * boundary Next refuses to build the page at all.
 */
export default async function SchoolsFinanceLedgerPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <Suspense fallback={null}>
        <SchoolsFeesContent />
      </Suspense>
    </div>
  );
}
