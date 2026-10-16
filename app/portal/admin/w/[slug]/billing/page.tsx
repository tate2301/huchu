import { notFound } from "next/navigation";

import { SubscriptionPanel } from "@/components/admin/billing/billing-panel";
import { PaymentsTable } from "@/components/admin/billing/payments-table";
import { PriceBreakdown } from "@/components/admin/billing/price-breakdown";
import { AdminPage, AdminPageHeader } from "@/components/admin/page-header";
import { StandingBadge } from "@/components/admin/standing-badge";
import { billingFacts, listPayments } from "@/lib/admin/billing";
import { SUBSCRIPTION_STATUS_LABEL } from "@/lib/admin/billing-words";
import { formatDate } from "@/lib/admin/format";
import { findWorkspace } from "@/lib/admin/workspaces";
import { requireOperator } from "@/lib/operators/guards";
import { operatorCan } from "@/lib/operators/roles";

import { extendTrialBy, recordPaymentFor, setStatusTo, settlePaymentIn } from "./actions";

export default async function WorkspaceBillingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [operator, workspace] = await Promise.all([requireOperator(), findWorkspace(slug)]);
  if (!workspace) notFound();
  const [{ subscription, pricing }, payments] = await Promise.all([billingFacts(workspace.id), listPayments({ companyId: workspace.id })]);

  return (
    <AdminPage>
      <AdminPageHeader title="Billing" />
      <div className="space-y-8 pb-6">
        <PriceBreakdown workspaceName={workspace.name} pricing={pricing} />
        <SubscriptionPanel
          workspaceName={workspace.name}
          status={subscription?.status ?? null}
          canManage={operatorCan(operator.role, "billing.manage")}
          facts={[
            ["Standing", <StandingBadge key="s" reading={workspace.standing} withDetail />],
            ["Status", subscription ? SUBSCRIPTION_STATUS_LABEL[subscription.status] : "No subscription"],
            ["Started", formatDate(subscription?.startedAt)],
            ["Trial ends", subscription?.trialEndsAt ? formatDate(subscription.trialEndsAt) : null],
            ["Paid to", formatDate(subscription?.currentPeriodEnd)],
          ]}
          actions={{
            extendTrial: extendTrialBy.bind(null, slug),
            setStatus: setStatusTo.bind(null, slug),
            recordPayment: recordPaymentFor.bind(null, slug),
          }}
        />
        <section aria-labelledby="payments-heading" className="space-y-2">
          <h2 id="payments-heading" className="t-section text-[var(--ink)]">
            Payments
          </h2>
          <PaymentsTable
            rows={payments.map((payment) => ({ ...payment, amount: payment.amount.toFixed(2) }))}
            withWorkspace={false}
            settle={operatorCan(operator.role, "payment.review") ? settlePaymentIn.bind(null, slug) : undefined}
            emptyTitle={`${workspace.name} has not paid anything yet`}
          />
        </section>
      </div>
    </AdminPage>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const workspace = await findWorkspace((await params).slug);
  return { title: `Billing · ${workspace?.name ?? "Workspace"} · Corelith admin` };
}
