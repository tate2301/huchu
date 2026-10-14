import { PaymentsTable } from "@/components/admin/billing/payments-table";
import { UrlTabs } from "@/components/admin/list-controls";
import { AdminPage, AdminPageHeader } from "@/components/admin/page-header";
import { listPayments } from "@/lib/admin/billing";
import { requireOperator } from "@/lib/operators/guards";
import { operatorCan } from "@/lib/operators/roles";
import { prisma } from "@/lib/prisma";

import { settleAnyPayment } from "./actions";

export const metadata = { title: "Payments · Corelith admin" };

/** The tabs, each a question billing asks: what needs someone, what came in, what did not. */
const TABS = {
  "needs-someone": { label: "Not confirmed", statuses: ["PENDING"] },
  waiting: { label: "Waiting on the customer", statuses: ["INITIATED"] },
  paid: { label: "Paid", statuses: ["PAID"] },
  failed: { label: "Failed", statuses: ["FAILED", "CANCELLED"] },
} as const;

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const current = tab && tab in TABS ? TABS[tab as keyof typeof TABS] : null;
  const [operator, rows, counts] = await Promise.all([
    requireOperator(),
    listPayments(current ? { statuses: [...current.statuses] } : {}),
    prisma.subscriptionPayment.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const count = (statuses: readonly string[]) =>
    counts.filter((row) => statuses.includes(row.status)).reduce((sum, row) => sum + row._count._all, 0);

  return (
    <AdminPage>
      <AdminPageHeader title="Payments" />
      <UrlTabs
        label="Payments by state"
        tabs={[
          { value: null, label: "All", count: counts.reduce((sum, row) => sum + row._count._all, 0) },
          ...Object.entries(TABS).map(([value, definition]) => ({ value, label: definition.label, count: count(definition.statuses) })),
        ]}
      />
      <PaymentsTable
        rows={rows.map((payment) => ({ ...payment, amount: payment.amount.toFixed(2) }))}
        withWorkspace
        settle={operatorCan(operator.role, "payment.review") ? settleAnyPayment : undefined}
        emptyTitle={current ? `No payment is ${current.label.toLowerCase()}` : "No payments yet"}
      />
    </AdminPage>
  );
}
