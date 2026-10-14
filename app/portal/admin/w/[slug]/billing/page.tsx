import { notFound } from "next/navigation";

import { PaymentsTable } from "@/components/admin/billing/payments-table";
import { PlanPanel } from "@/components/admin/billing/plan-panel";
import { AdminPage, AdminPageHeader } from "@/components/admin/page-header";
import { StandingBadge } from "@/components/admin/standing-badge";
import { billingFacts, listPayments } from "@/lib/admin/billing";
import { formatDate, formatMoney } from "@/lib/admin/format";
import { findWorkspace } from "@/lib/admin/workspaces";
import { requireOperator } from "@/lib/operators/guards";
import { operatorCan } from "@/lib/operators/roles";

import { changePlanTo, extendTrialBy, recordPaymentFor, settlePaymentIn, turnAddOn } from "./actions";

export default async function WorkspaceBillingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [operator, workspace] = await Promise.all([requireOperator(), findWorkspace(slug)]);
  if (!workspace) notFound();
  const [facts, payments] = await Promise.all([billingFacts(workspace.id), listPayments({ companyId: workspace.id })]);
  const subscription = facts.subscription;

  return (
    <AdminPage>
      <AdminPageHeader title="Plan and billing" />
      <div className="space-y-8 pb-6">
        <PlanPanel
          workspaceName={workspace.name}
          plan={subscription ? { code: subscription.plan.code, name: subscription.plan.name } : null}
          onTrial={subscription?.status === "TRIALING"}
          facts={[
            ["Standing", <StandingBadge key="s" reading={workspace.standing} withDetail />],
            ["Plan", subscription ? <span key="pl">{subscription.plan.name}, <span className="font-mono tabular-nums">{formatMoney(subscription.plan.monthlyPrice)}</span> a month</span> : null],
            ["Pays", <span key="p"><span className="font-mono tabular-nums">{formatMoney(facts.monthlyTotal)}</span> a month, with add-ons</span>],
            subscription?.status === "TRIALING"
              ? ["Trial ends", formatDate(subscription.trialEndsAt)]
              : ["Paid to", formatDate(subscription?.currentPeriodEnd)],
          ]}
          tiers={facts.tiers}
          addOns={facts.addOns}
          canManage={operatorCan(operator.role, "billing.manage")}
          actions={{
            extendTrial: extendTrialBy.bind(null, slug),
            changePlan: changePlanTo.bind(null, slug),
            turnAddOn: turnAddOn.bind(null, slug),
            recordPayment: recordPaymentFor.bind(null, slug),
          }}
        />
        <section aria-label="Payments" className="space-y-2">
          <h2 className="t-section text-[var(--ink)]">Payments</h2>
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
  return { title: `Plan and billing · ${workspace?.name ?? "Workspace"} · Corelith admin` };
}
